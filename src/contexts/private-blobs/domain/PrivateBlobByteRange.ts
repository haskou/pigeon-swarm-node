import { PrivateBlobRangeOutOfBoundsError } from './errors/PrivateBlobRangeOutOfBoundsError';
import { PrivateBlobRangeRequest } from './PrivateBlobRangeRequest';

/** Inclusive byte window of a blob, validated against its size. */
export class PrivateBlobByteRange {
  public static of(
    start: number,
    end: number,
    size: number,
  ): PrivateBlobByteRange {
    const valid =
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      start <= end &&
      end < size;

    if (!valid) {
      throw new PrivateBlobRangeOutOfBoundsError(size);
    }

    return new PrivateBlobByteRange(start, end);
  }

  /** Resolves a requested window against a blob size (RFC 9110 `bytes` semantics). */
  public static resolve(
    request: PrivateBlobRangeRequest,
    size: number,
  ): PrivateBlobByteRange {
    switch (request.kind) {
      case 'suffix':
        return PrivateBlobByteRange.of(
          Math.max(size - request.length, 0),
          size - 1,
          size,
        );
      case 'from':
        return PrivateBlobByteRange.of(
          request.first,
          request.last === undefined
            ? size - 1
            : Math.min(request.last, size - 1),
          size,
        );
      case 'invalid':
        throw new PrivateBlobRangeOutOfBoundsError(size);
    }
  }

  private constructor(
    /** Inclusive. */
    public readonly start: number,
    /** Inclusive. */
    public readonly end: number,
  ) {}
}
