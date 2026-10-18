/** Epoch-millisecond range of `Timestamp` and of ECMAScript `Date`: ±8.64e15. */
const RANGE_MILLISECONDS = BigInt('8640000000000000');

/** Largest encoded value: the range maximum, offset to be non-negative. */
const MAX_ENCODED = (BigInt(2) * RANGE_MILLISECONDS).toString();

/**
 * Fixed-width, order-preserving rendering of an epoch-millisecond timestamp.
 * ISO-8601 is not usable as a position: years outside 0000–9999 render with a
 * sign and extra digits, and those strings sort wrongly and fail to round-trip.
 */
export class PageTimestamp {
  private static readonly WIDTH = 17;
  private static readonly PATTERN = /^\d{17}$/;

  public static of(milliseconds: number): string {
    return (BigInt(Math.floor(milliseconds)) + RANGE_MILLISECONDS)
      .toString()
      .padStart(PageTimestamp.WIDTH, '0');
  }

  /**
   * Whether `text` is one `of` could have produced. Fixed width makes string
   * comparison numeric, so no float conversion is involved.
   */
  public static isValid(text: string): boolean {
    return PageTimestamp.PATTERN.test(text) && text <= MAX_ENCODED;
  }
}
