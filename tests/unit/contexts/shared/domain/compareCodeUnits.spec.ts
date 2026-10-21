import { compareCodeUnits } from '@app/contexts/shared/domain/compareCodeUnits';

describe(compareCodeUnits.name, () => {
  it('orders by code unit, not by locale collation', () => {
    expect(
      ['aAAA', 'a_AA', 'BBBB', 'a'].sort((left, right) =>
        compareCodeUnits(left, right),
      ),
    ).toEqual(['BBBB', 'a', 'aAAA', 'a_AA']);
    expect(compareCodeUnits('x', 'x')).toBe(0);
  });
});
