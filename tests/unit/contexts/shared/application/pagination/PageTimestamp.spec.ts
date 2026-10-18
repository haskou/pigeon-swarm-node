import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

describe('PageTimestamp', () => {
  const EXTREME_MILLISECONDS = 8_640_000_000_000_000;

  it('renders a fixed width of 17 digits', () => {
    expect(PageTimestamp.of(0)).toHaveLength(17);
    expect(PageTimestamp.of(1_767_225_600_000)).toHaveLength(17);
    expect(PageTimestamp.of(EXTREME_MILLISECONDS)).toHaveLength(17);
    expect(PageTimestamp.of(-EXTREME_MILLISECONDS)).toHaveLength(17);
  });

  it('renders the lowest and highest timestamps at the ends of the range', () => {
    expect(PageTimestamp.of(-EXTREME_MILLISECONDS)).toBe('00000000000000000');
    expect(PageTimestamp.of(EXTREME_MILLISECONDS)).toBe('17280000000000000');
  });

  it('sorts as the timestamps do, including years outside 0000–9999', () => {
    const ordered = [
      -EXTREME_MILLISECONDS,
      -62_167_219_200_001,
      -1,
      0,
      1_767_225_600_000,
      253_402_300_799_999,
      EXTREME_MILLISECONDS,
    ];
    const positions = ordered.map((milliseconds) =>
      PageTimestamp.of(milliseconds),
    );

    expect([...positions].sort()).toEqual(positions);
  });

  it('floors sub-millisecond values so the position stays integral', () => {
    expect(PageTimestamp.of(1_000.9)).toBe(PageTimestamp.of(1_000));
  });

  it('stays exact for odd values above 2^53 near the range maximum', () => {
    expect(PageTimestamp.of(EXTREME_MILLISECONDS - 1)).toBe(
      '17279999999999999',
    );
    expect(PageTimestamp.of(EXTREME_MILLISECONDS - 3)).toBe(
      '17279999999999997',
    );
  });

  it('accepts exactly the positions it can produce', () => {
    expect(PageTimestamp.isValid(PageTimestamp.of(-EXTREME_MILLISECONDS))).toBe(
      true,
    );
    expect(PageTimestamp.isValid(PageTimestamp.of(EXTREME_MILLISECONDS))).toBe(
      true,
    );
    expect(PageTimestamp.isValid('17280000000000001')).toBe(false);
    expect(PageTimestamp.isValid('99999999999999999')).toBe(false);
    expect(PageTimestamp.isValid('2026-01-01T00:00:00.000Z')).toBe(false);
    expect(PageTimestamp.isValid('1767225600000')).toBe(false);
    expect(PageTimestamp.isValid('0000000000000000a')).toBe(false);
  });
});
