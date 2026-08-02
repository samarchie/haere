export interface ByteRange {
  start: number;
  end: number;
}

export interface VerdictValue {
  minutes: number | null;
}

export function rowByteRange(
  rowIndex: number,
  hexCount: number,
  bytesPerValue: number,
): ByteRange {
  const start = rowIndex * hexCount * bytesPerValue;
  const end = start + hexCount * bytesPerValue;
  return { start, end };
}

export function readValueAt(
  rowBytes: Uint8Array,
  colIndex: number,
  bytesPerValue: number,
): number {
  const offset = colIndex * bytesPerValue;
  const view = new DataView(
    rowBytes.buffer,
    rowBytes.byteOffset + offset,
    bytesPerValue,
  );
  return bytesPerValue === 1 ? view.getUint8(0) : view.getUint16(0, true);
}

export function toVerdictValue(
  rawValue: number,
  unreachableSentinel: number,
): VerdictValue {
  return { minutes: rawValue >= unreachableSentinel ? null : rawValue };
}

export function computeDeltaMinutes(
  baseline: VerdictValue,
  modified: VerdictValue,
): number | null {
  if (baseline.minutes === null || modified.minutes === null) {
    return null;
  }
  return modified.minutes - baseline.minutes;
}

export async function fetchRow(
  url: string,
  rowIndex: number,
  hexCount: number,
  bytesPerValue: number,
): Promise<Uint8Array> {
  const { start, end } = rowByteRange(rowIndex, hexCount, bytesPerValue);
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end - 1}` },
  });
  if (response.status !== 206) {
    throw new Error(
      `Expected a 206 Partial Content response for a Range request to ${url}, got ${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
