/**
 * web adapter — downloads one public file over https for the skill import (URL import).
 *
 * SSRF guard:
 *  - only `https:` on the default port, no credentials in the URL;
 *  - host names are resolved through a guarded `lookup` that refuses loopback, private,
 *    link-local, CGNAT, multicast, documentation and other reserved ranges. The check runs at
 *    connect time on the address actually dialled, so a DNS answer that changes between check
 *    and connect (rebinding) cannot slip through. IP-literal hosts are checked before
 *    connecting, since Node skips `lookup` for them;
 *  - redirects are followed by hand (at most `maxRedirects`), each hop re-checked;
 *  - one deadline for the whole download, and the body is streamed under a byte cap.
 *
 * Implements the skills module's `TextFetcher` port structurally; the composition root wires it.
 */
import { request } from 'node:https';
import { promises as dns, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';

/** Default deadline of one download, redirects included (milliseconds). */
const DEFAULT_TIMEOUT_MS = 10_000;
/** Default number of redirects followed. */
const DEFAULT_MAX_REDIRECTS = 3;
/** Error code of a refused address, used to tell it apart from network failures. */
const BLOCKED_CODE = 'EBLOCKEDADDRESS';

/**
 * Address ranges a download may never connect to. IPv4-mapped IPv6 addresses
 * (`::ffff:127.0.0.1`) are checked against the IPv4 ranges by BlockList itself.
 */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

/**
 * @param address An IP address (an IPv6 zone id is ignored).
 * @returns True when the address is not a public unicast address, or not an IP at all.
 */
export function isBlockedAddress(address: string): boolean {
  const ip = address.split('%')[0] ?? '';
  const family = isIP(ip);
  if (family === 0) return true;
  return BLOCKED.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** Resolves a host name to all its addresses. */
export type Resolve = (hostname: string) => Promise<LookupAddress[]>;

/** The `lookup` signature `https.request` calls. */
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Build a `lookup` for `https.request` that refuses hosts resolving to a blocked address.
 * Any blocked address in the answer refuses the host, so no address of a mixed answer is used.
 * @param resolve The resolver (system DNS in production, a fake in tests).
 * @returns The lookup function.
 */
export function guardedLookup(resolve: Resolve) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    resolve(hostname).then(
      (addresses) => {
        const blocked = addresses.find((a) => isBlockedAddress(a.address));
        if (blocked || addresses.length === 0) {
          const err: NodeJS.ErrnoException = new Error(
            blocked
              ? `${hostname} resolves to a private or reserved address (${blocked.address}); it is not fetched.`
              : `${hostname} does not resolve.`,
          );
          err.code = blocked ? BLOCKED_CODE : 'ENOTFOUND';
          callback(err, '', 0);
          return;
        }
        const wanted = options.family === 4 || options.family === 6 ? options.family : 0;
        const usable = wanted ? addresses.filter((a) => a.family === wanted) : addresses;
        const first = usable[0];
        if (!first) {
          const err: NodeJS.ErrnoException = new Error(`${hostname} has no IPv${wanted} address.`);
          err.code = 'ENOTFOUND';
          callback(err, '', 0);
        } else if (options.all) {
          callback(null, usable);
        } else {
          callback(null, first.address, first.family);
        }
      },
      (err: NodeJS.ErrnoException) => callback(err, '', 0),
    );
  };
}

/**
 * Validate a URL before any connection is made.
 * @param raw The URL to fetch.
 * @returns The parsed URL.
 * @throws ValidationError when the URL is not an allowed https address.
 */
export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('Not a valid URL.');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Only https URLs are allowed.');
  if (url.username || url.password) throw new ValidationError('URLs with credentials are not allowed.');
  if (url.port !== '' && url.port !== '443') throw new ValidationError('Only the default https port is allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) {
    throw new ValidationError(`${host} is a local host name; it is not fetched.`);
  }
  if (isIP(host) && isBlockedAddress(host)) {
    throw new ValidationError(`${host} is a private or reserved address; it is not fetched.`);
  }
  return url;
}

/** Outcome of one request. */
type Hop = { kind: 'redirect'; location: string } | { kind: 'ok'; bytes: Uint8Array };

/** Options of the fetcher; tests swap the resolver and shorten the deadline. */
export interface HttpsTextFetcherOptions {
  resolve?: Resolve;
  timeoutMs?: number;
  maxRedirects?: number;
}

export class HttpsTextFetcher {
  private readonly resolve: Resolve;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;

  /**
   * @param options Resolver, deadline and redirect limit (system DNS, 10 s and 3 by default).
   */
  constructor(options: HttpsTextFetcherOptions = {}) {
    this.resolve = options.resolve ?? ((hostname) => dns.lookup(hostname, { all: true, verbatim: true }));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  }

  /**
   * @param url An https URL.
   * @param maxBytes Most bytes to download.
   * @returns The final URL and the downloaded bytes.
   * @throws ValidationError for a refused URL or address, too many redirects or a body over the
   *   cap; ExternalServiceError when the server fails or answers anything but 200.
   */
  async fetch(url: string, maxBytes: number): Promise<{ url: string; bytes: Uint8Array }> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    let current = url;
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const target = assertAllowedUrl(current);
      const result = await this.get(target, maxBytes, signal);
      if (result.kind === 'ok') return { url: target.toString(), bytes: result.bytes };
      current = new URL(result.location, target).toString();
    }
    throw new ValidationError(`Too many redirects (more than ${this.maxRedirects}).`);
  }

  /**
   * One GET without following redirects.
   * @param url The checked URL.
   * @param maxBytes Most bytes to read from the body.
   * @param signal Deadline of the whole download.
   * @returns The redirect target or the body.
   */
  private get(url: URL, maxBytes: number, signal: AbortSignal): Promise<Hop> {
    return new Promise<Hop>((resolve, reject) => {
      const tooLarge = (): ValidationError =>
        new ValidationError(`The file at ${url.host} is larger than ${maxBytes} bytes.`);
      const req = request(
        url,
        {
          method: 'GET',
          lookup: guardedLookup(this.resolve),
          signal,
          headers: { 'user-agent': 'devdigest-skill-import', accept: '*/*' },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            res.resume();
            const location = res.headers.location;
            if (location) resolve({ kind: 'redirect', location });
            else reject(new ExternalServiceError(`${url.host} sent a redirect without a Location.`));
            return;
          }
          if (status !== 200) {
            res.resume();
            reject(new ExternalServiceError(`${url.host} answered HTTP ${status}.`, { status }));
            return;
          }
          if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
            res.destroy();
            reject(tooLarge());
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxBytes) {
              res.destroy();
              reject(tooLarge());
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve({ kind: 'ok', bytes: new Uint8Array(Buffer.concat(chunks)) }));
          res.on('error', (err) => reject(new ExternalServiceError(`Download from ${url.host} failed: ${err.message}`)));
        },
      );
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === BLOCKED_CODE) reject(new ValidationError(err.message));
        else if (signal.aborted) reject(new ExternalServiceError(`Download from ${url.host} timed out.`));
        else reject(new ExternalServiceError(`Could not download from ${url.host}: ${err.message}`));
      });
      req.end();
    });
  }
}
