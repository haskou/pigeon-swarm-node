export type PageOrder = 'asc' | 'desc';

/**
 * Slices an in-memory list into one page of items strictly after `after` in
 * the requested order. `nextPosition` is set only when the page is full, so a
 * full last page may be followed by an empty page with no next position.
 *
 * Positions MUST be unique per item and fixed-width when they hold timestamps,
 * because they compare as strings.
 */
export class PageSlice<T> {
  private static compare(left: string, right: string): number {
    if (left === right) return 0;

    return left < right ? -1 : 1;
  }

  public static of<T>(input: {
    items: readonly T[];
    position: (item: T) => string;
    order: PageOrder;
    limit: number;
    after: string | undefined;
  }): PageSlice<T> {
    const direction = input.order === 'asc' ? 1 : -1;
    const sorted = [...input.items].sort(
      (left, right) =>
        direction *
        PageSlice.compare(input.position(left), input.position(right)),
    );
    const remaining =
      input.after === undefined
        ? sorted
        : sorted.filter(
            (item) =>
              direction *
                PageSlice.compare(input.position(item), input.after!) >
              0,
          );
    const items = remaining.slice(0, input.limit);
    const last = items.at(-1);

    return new PageSlice(
      items,
      items.length === input.limit && last !== undefined
        ? input.position(last)
        : undefined,
    );
  }

  private constructor(
    public readonly items: T[],
    public readonly nextPosition: string | undefined,
  ) {}
}
