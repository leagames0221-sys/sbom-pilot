/**
 * Atomic file write helper.
 *
 * Writes content to a temporary path in the same directory, fsyncs, then
 * renames into place. Partial writes are invisible to other readers because
 * `rename(2)` (or its Windows equivalent via Node `fs.rename`) is atomic
 * relative to the filesystem.
 *
 * Spec mapping:
 *   - AC-001-3 (SBOM emitter atomic write to `--output` path)
 *   - AC-002-7 (scan output never partial on Ctrl-C)
 *   - AC-003-8 (compliance report atomic emit, UTF-8 no BOM)
 *
 * Reference: Linux man rename(2), Node docs `fs.promises.rename`.
 */
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface AtomicWriteOptions {
  /** Open mode for the target file. Defaults to `0o644`. */
  readonly mode?: number;
  /** When true, ensure the parent directory exists (mkdir recursive). */
  readonly mkdirParent?: boolean;
}

/**
 * Write `data` to `targetPath` atomically.
 *
 * Steps:
 *   1. Resolve parent dir, optionally `mkdir -p`
 *   2. Open `<targetPath>.tmp-<rand>` for writing
 *   3. Write payload, fsync, close
 *   4. Rename temp → target (atomic w.r.t. concurrent readers)
 *   5. On any failure, unlink the temp path and rethrow.
 */
export async function atomicWrite(
  targetPath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const parent = dirname(targetPath);
  if (options.mkdirParent === true) {
    await fs.mkdir(parent, { recursive: true });
  }

  const tmpSuffix = randomBytes(8).toString('hex');
  const tmpPath = join(parent, `${basename(targetPath)}.tmp-${tmpSuffix}`);

  const payload: Uint8Array =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;

  let handle: import('node:fs').promises.FileHandle | null = null;
  try {
    handle = await fs.open(tmpPath, 'w', options.mode ?? 0o644);
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    if (handle !== null) {
      try {
        await handle.close();
      } catch {
        /* ignore cleanup failure */
      }
    }
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* ignore: temp may not exist yet */
    }
    throw err;
  }
}

function basename(p: string): string {
  const m = p.match(/[^/\\]+$/);
  return m === null ? p : m[0];
}
