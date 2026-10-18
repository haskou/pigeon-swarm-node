import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

describe('PigeonEnvironment NODE_INITIALIZER_TIMEOUT_MS', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it('should default to 10 minutes', () => {
    delete process.env.NODE_INITIALIZER_TIMEOUT_MS;

    expect(pigeonEnvironment().NODE_INITIALIZER_TIMEOUT_MS).toBe(600_000);
  });

  it.each([
    ['1', 1],
    ['2147483647', 2_147_483_647],
    ['30000', 30_000],
  ])('should accept %s', (raw, expected) => {
    process.env.NODE_INITIALIZER_TIMEOUT_MS = raw;

    expect(pigeonEnvironment().NODE_INITIALIZER_TIMEOUT_MS).toBe(expected);
  });

  it.each([['0'], ['-1'], ['1.5'], ['soon'], ['2147483648']])(
    'should reject %s and name the variable',
    (raw) => {
      process.env.NODE_INITIALIZER_TIMEOUT_MS = raw;

      expect(() => pigeonEnvironment()).toThrow(/NODE_INITIALIZER_TIMEOUT_MS/);
    },
  );
});
