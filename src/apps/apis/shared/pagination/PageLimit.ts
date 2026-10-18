export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

/**
 * Reads the `limit` query parameter. Absent or non-numeric values take the
 * default; numeric values are truncated and clamped to 1..MAX_PAGE_LIMIT.
 */
export class PageLimit {
  public static parse(value: unknown): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;

    if (!Number.isFinite(parsed)) return DEFAULT_PAGE_LIMIT;

    return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_LIMIT);
  }
}
