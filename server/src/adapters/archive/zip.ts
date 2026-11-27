/**
 * archive adapter — reads zip archives (`.zip`, `.skill`) in memory for the skill import.
 *
 * Built on fflate (pure JS, no natives, no dependencies). It never writes an entry to disk and
 * never runs one. `list` reads only the central directory (nothing is inflated) and stops at a
 * record cap: the record count comes from the archive itself, and a crafted ZIP64 end record can
 * declare 2^32 - 1 records that fflate would walk one by one; `read` inflates
 * a single entry and stops as soon as the output passes `maxBytes`, without trusting the size
 * the archive declares — the archive is pushed in small slices, so a zip bomb cannot inflate
 * more than one slice's worth past the cap.
 *
 * Implements the skills module's `ArchiveReader` port structurally (adapters do not import
 * module code); the composition root wires it.
 */
import { Unzip, UnzipInflate, UnzipPassThrough, unzipSync } from 'fflate';
import { ValidationError } from '../../platform/errors.js';

/** Compressed bytes pushed per step; deflate expands at most ~1032×, so ≤ ~4 MiB per step. */
const PUSH_SLICE_BYTES = 4096;

/** One file entry of an archive. */
export interface ZipEntry {
  /** Entry name exactly as stored in the archive. */
  name: string;
  /** Unpacked size the archive declares (bytes). */
  size: number;
}

export class FflateZipReader {
  /**
   * List the file entries without unpacking them.
   * @param bytes The archive.
   * @param maxEntries Most central-directory records (directories included) to walk.
   * @returns File entries; directory entries are left out.
   * @throws ValidationError when the bytes are not a readable zip archive or hold more than
   *   `maxEntries` records.
   */
  list(bytes: Uint8Array, maxEntries: number): ZipEntry[] {
    const entries: ZipEntry[] = [];
    const tooMany = new ValidationError(`The archive has more than ${maxEntries} entries; the limit is ${maxEntries}.`);
    let seen = 0;
    try {
      unzipSync(bytes, {
        filter: (file) => {
          seen += 1;
          if (seen > maxEntries) throw tooMany;
          if (!file.name.endsWith('/')) entries.push({ name: file.name, size: file.originalSize });
          return false;
        },
      });
    } catch (err) {
      if (err === tooMany) throw tooMany;
      throw new ValidationError('The file is not a readable zip archive.');
    }
    return entries;
  }

  /**
   * Unpack one entry under a byte cap.
   * @param bytes The archive.
   * @param name Entry name as returned by `list`.
   * @param maxBytes Most bytes to unpack.
   * @returns The entry's content.
   * @throws ValidationError when the entry is missing, unreadable or larger than `maxBytes`.
   */
  read(bytes: Uint8Array, name: string, maxBytes: number): Uint8Array {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let found = false;
    let done = false;
    let overflow = false;
    let failure: unknown;

    const unzip = new Unzip((file) => {
      if (found || file.name !== name) return;
      found = true;
      file.ondata = (err, chunk, final) => {
        if (overflow || done) return;
        if (err) {
          failure = err;
          done = true;
          return;
        }
        total += chunk.length;
        if (total > maxBytes) {
          overflow = true;
          file.terminate();
          return;
        }
        chunks.push(chunk);
        if (final) done = true;
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);

    try {
      for (let offset = 0; offset < bytes.length && !overflow && !done; offset += PUSH_SLICE_BYTES) {
        const end = Math.min(offset + PUSH_SLICE_BYTES, bytes.length);
        unzip.push(bytes.subarray(offset, end), end === bytes.length);
      }
    } catch (err) {
      failure ??= err;
    }

    if (overflow) throw new ValidationError(`${name} unpacks to more than ${maxBytes} bytes.`);
    if (!found) throw new ValidationError(`${name} is missing from the archive.`);
    if (failure || !done) throw new ValidationError(`${name} could not be unpacked.`);

    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}
