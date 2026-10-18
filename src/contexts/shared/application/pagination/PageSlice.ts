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
    const positioned = input.items.map((item) => ({
      item,
      position: input.position(item),
    }));
    const sorted = positioned.sort(
      (left, right) =>
        direction * PageSlice.compare(left.position, right.position),
    );
    const remaining =
      input.after === undefined
        ? sorted
        : sorted.filter(
            ({ position }) =>
              direction * PageSlice.compare(position, input.after!) > 0,
          );
    const page = remaining.slice(0, input.limit);
    const last = page.at(-1);

    return new PageSlice(
      page.map(({ item }) => item),
      page.length === input.limit && last !== undefined
        ? last.position
        : undefined,
    );
  }

  private constructor(
    public readonly items: T[],
    public readonly nextPosition: string | undefined,
  ) {}
}
