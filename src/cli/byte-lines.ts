import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

export type ByteLineSummary = {
  readonly bytes: number;
  readonly containsCarriageReturn: boolean;
  readonly endsWithLf: boolean;
  readonly lineCount: number;
  readonly sha256: string;
};

type ByteLineHandler = (line: Buffer, lineNumber: number) => void;

function asBuffer(chunk: unknown): Buffer {
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new TypeError(`stream yielded unsupported chunk ${String(chunk)}`);
}

/** Streams LF-delimited bytes without normalizing encoding or line endings. */
export async function forEachByteLine(
  stream: Readable,
  onLine: ByteLineHandler,
): Promise<ByteLineSummary> {
  const hash = createHash("sha256");
  let bytes = 0;
  let containsCarriageReturn = false;
  let lastByte: number | undefined;
  let lineCount = 0;
  let pending = Buffer.alloc(0);

  for await (const chunkValue of stream as AsyncIterable<unknown>) {
    const chunk = asBuffer(chunkValue);
    if (chunk.length === 0) {
      continue;
    }
    hash.update(chunk);
    bytes += chunk.length;
    containsCarriageReturn ||= chunk.includes(0x0d);
    lastByte = chunk[chunk.length - 1];

    const data = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    let start = 0;
    for (;;) {
      const newline = data.indexOf(0x0a, start);
      if (newline === -1) {
        break;
      }
      lineCount += 1;
      onLine(data.subarray(start, newline), lineCount);
      start = newline + 1;
    }
    pending = Buffer.from(data.subarray(start));
  }

  if (pending.length !== 0) {
    lineCount += 1;
    onLine(pending, lineCount);
  }

  return {
    bytes,
    containsCarriageReturn,
    endsWithLf: lastByte === 0x0a,
    lineCount,
    sha256: hash.digest("hex"),
  };
}
