import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';

describe(DeviceAuthorizationOperationId.name, () => {
  describe('compareTo', () => {
    const lower = new DeviceAuthorizationOperationId(
      'aaaaaaaa-0000-4000-8000-000000000000',
    );
    const upper = new DeviceAuthorizationOperationId(
      'BBBBBBBB-0000-4000-8000-000000000000',
    );

    it('orders by code unit, not locale collation', () => {
      expect(upper.compareTo(lower)).toBeLessThan(0);
      expect(lower.compareTo(upper)).toBeGreaterThan(0);
    });

    it('treats equal ids as equal', () => {
      expect(
        lower.compareTo(new DeviceAuthorizationOperationId(lower.valueOf())),
      ).toBe(0);
    });

    it('sorts ids the same as plain code unit sort', () => {
      const ids = [lower, upper];

      expect(
        [...ids]
          .sort((left, right) => left.compareTo(right))
          .map((id) => id.valueOf()),
      ).toEqual(ids.map((id) => id.valueOf()).sort());
    });
  });
});
