import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

describe('PageSlice', () => {
  const items = ['d', 'b', 'a', 'c'];
  const position = (item: string): string => item;

  it('pages ascending and sets nextPosition on a full page', () => {
    const page = PageSlice.of({
      items,
      position,
      order: 'asc',
      limit: 2,
      after: undefined,
    });

    expect(page.items).toEqual(['a', 'b']);
    expect(page.nextPosition).toEqual('b');
  });

  it('pages descending', () => {
    const page = PageSlice.of({
      items,
      position,
      order: 'desc',
      limit: 2,
      after: undefined,
    });

    expect(page.items).toEqual(['d', 'c']);
    expect(page.nextPosition).toEqual('c');
  });

  it('continues strictly after the given position', () => {
    const page = PageSlice.of({
      items,
      position,
      order: 'asc',
      limit: 2,
      after: 'b',
    });

    expect(page.items).toEqual(['c', 'd']);
    expect(page.nextPosition).toEqual('d');
  });

  it('leaves nextPosition unset on a short last page', () => {
    const page = PageSlice.of({
      items,
      position,
      order: 'asc',
      limit: 3,
      after: 'b',
    });

    expect(page.items).toEqual(['c', 'd']);
    expect(page.nextPosition).toBeUndefined();
  });

  it('returns an empty page with no next position after the end', () => {
    const page = PageSlice.of({
      items,
      position,
      order: 'asc',
      limit: 2,
      after: 'd',
    });

    expect(page.items).toEqual([]);
    expect(page.nextPosition).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = ['b', 'a'];

    PageSlice.of({
      items: input,
      position,
      order: 'asc',
      limit: 2,
      after: undefined,
    });

    expect(input).toEqual(['b', 'a']);
  });

  it('pages every item once across same-millisecond ties', () => {
    const rows: { created: string; id: string }[] = [
      { created: '1|c', id: 'c' },
      { created: '1|a', id: 'a' },
      { created: '2|b', id: 'b' },
      { created: '1|b', id: 'b1' },
    ];
    const position = (row: { created: string; id: string }): string =>
      row.created;
    const seen: string[] = [];
    let after: string | undefined;

    for (;;) {
      const page = PageSlice.of({
        items: rows,
        position,
        order: 'asc',
        limit: 2,
        after,
      });

      seen.push(...page.items.map((row) => row.id));

      if (page.nextPosition === undefined) break;

      after = page.nextPosition;
    }

    expect(seen).toEqual(['a', 'b1', 'c', 'b']);
  });

  it('computes each position once per item', () => {
    const position = jest.fn((item: string): string => item);

    PageSlice.of({
      items: ['c', 'a', 'b'],
      position,
      order: 'asc',
      limit: 2,
      after: 'a',
    });

    expect(position).toHaveBeenCalledTimes(3);
  });
});
