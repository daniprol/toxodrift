import { execFile } from 'node:child_process';
import { access, rename, rm } from 'node:fs/promises';
import { promisify } from 'node:util';

const runProcess = promisify(execFile);
const CONVERSION_TIMEOUT_MS = 120_000;

interface MusicConversionOptions {
  source: string;
  destination: string;
}

/** Only completed conversions become cache entries; a failed run is safe to retry. */
export async function convertMusic(options: MusicConversionOptions): Promise<void> {
  const { source, destination } = options;

  try {
    await access(destination);

    return;
  } catch {
    // First conversion, or a retry after an earlier failure.
  }

  const temporaryOutput = `${destination}.partial.ogg`;

  try {
    await runProcess(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        source,
        '-c:a',
        'libvorbis',
        '-q:a',
        '4',
        temporaryOutput,
      ],
      { timeout: CONVERSION_TIMEOUT_MS },
    );

    await rename(temporaryOutput, destination);
  } catch (error) {
    throw new Error(
      'Music conversion needs FFmpeg with libopenmpt support. Install ffmpeg and rerun pnpm assets:audio.',
      { cause: error },
    );
  } finally {
    await rm(temporaryOutput, { force: true });
  }
}
