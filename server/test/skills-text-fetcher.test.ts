import { describe, it, expect } from 'vitest';
import type { LookupAddress } from 'node:dns';
import {
  HttpsTextFetcher,
  assertAllowedUrl,
  guardedLookup,
  isBlockedAddress,
  type Resolve,
} from '../src/adapters/web/text-fetcher.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * SSRF guard of the skill URL import. Hermetic: every refusal happens before a connection, and
 * resolvers are fakes, so no test touches the network.
 */

/**
 * @param addresses Answer of the fake resolver.
 * @returns A resolver that always returns it.
 */
const fakeResolve = (...addresses: LookupAddress[]): Resolve => async () => addresses;

/**
 * Call a lookup and collect its callback arguments.
 * @param resolve The resolver behind the guarded lookup.
 * @param all Whether to ask for every address.
 * @returns The callback's error and address.
 */
function lookup(resolve: Resolve, all = false): Promise<{ err: NodeJS.ErrnoException | null; address: unknown }> {
  return new Promise((done) => {
    guardedLookup(resolve)('skills.example.com', { all }, (err, address) => done({ err, address }));
  });
}

describe('isBlockedAddress', () => {
  it('refuses loopback, private, link-local, CGNAT, multicast and mapped addresses', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1%eth0', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-ip',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows public unicast addresses', () => {
    for (const ip of ['8.8.8.8', '140.82.112.3', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe('assertAllowedUrl', () => {
  it('accepts a public https URL on the default port', () => {
    expect(assertAllowedUrl('https://raw.githubusercontent.com/a/b/main/SKILL.md').host).toBe(
      'raw.githubusercontent.com',
    );
  });

  it('refuses other schemes, credentials, ports, local names and private IP literals', () => {
    for (const url of [
      'http://example.com/SKILL.md',
      'file:///etc/passwd',
      'https://user:pw@example.com/a',
      'https://example.com:8443/a',
      'https://localhost/a',
      'https://db.internal/a',
      'https://127.0.0.1/a',
      'https://[::1]/a',
      'https://169.254.169.254/latest/meta-data',
      'not a url',
    ]) {
      expect(() => assertAllowedUrl(url), url).toThrow(ValidationError);
    }
  });
});

describe('guardedLookup', () => {
  it('passes public answers through, single or all', async () => {
    const resolve = fakeResolve({ address: '140.82.112.3', family: 4 });
    expect(await lookup(resolve)).toEqual({ err: null, address: '140.82.112.3' });
    expect(await lookup(resolve, true)).toEqual({ err: null, address: [{ address: '140.82.112.3', family: 4 }] });
  });

  it('refuses a host when any address of its answer is blocked (DNS rebinding)', async () => {
    const { err } = await lookup(fakeResolve({ address: '140.82.112.3', family: 4 }, { address: '10.0.0.5', family: 4 }));
    expect(err?.code).toBe('EBLOCKEDADDRESS');
    expect(err?.message).toMatch(/10\.0\.0\.5/);
  });
});

describe('HttpsTextFetcher', () => {
  it('refuses a private IP literal before connecting', async () => {
    await expect(new HttpsTextFetcher().fetch('https://127.0.0.1/SKILL.md', 1024)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses a host that resolves to a private address at connect time', async () => {
    const fetcher = new HttpsTextFetcher({ resolve: fakeResolve({ address: '192.168.0.10', family: 4 }), timeoutMs: 2000 });
    await expect(fetcher.fetch('https://skills.example.com/SKILL.md', 1024)).rejects.toThrow(
      /resolves to a private or reserved address/,
    );
  });
});
