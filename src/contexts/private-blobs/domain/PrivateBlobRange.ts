import { PrivateBlobRangeNotSatisfiableError } from './errors/PrivateBlobRangeNotSatisfiableError';
import { PrivateBlobByteRange } from './PrivateBlobByteRange';

/** Single `bytes=` range (RFC 9110). Multi-range requests are not supported. */
export class PrivateBlobRange {
  private static readonly PATTERN = /^bytes=(\d*)-(\d*)$/;

  private static suffix(length: number, size: number): PrivateBlobByteRange {
    return { end: size - 1, start: Math.max(size - length, 0) };
  }

  private static bounded(
    first: string,
    last: string,
    size: number,
  ): PrivateBlobByteRange {
    return {
      end: last === '' ? size - 1 : Math.min(Number(last), size - 1),
      start: Number(first),
    };
  }

  public static resolve(
    header: string | undefined,
    size: number,
  ): PrivateBlobByteRange | undefined {
    if (header === undefined) {
      return undefined;
    }

    const match = PrivateBlobRange.PATTERN.exec(header.trim());

    if (!match || (match[1] === '' && match[2] === '')) {
      throw new PrivateBlobRangeNotSatisfiableError(size);
    }

    const range =
      match[1] === ''
        ? PrivateBlobRange.suffix(Number(match[2]), size)
        : PrivateBlobRange.bounded(match[1], match[2], size);

    if (range.start > range.end || range.start >= size) {
      throw new PrivateBlobRangeNotSatisfiableError(size);
    }

    return range;
  }
}
