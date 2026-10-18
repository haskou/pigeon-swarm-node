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

describe('PigeonEnvironment SERVED_SLOTS_PER_SOURCE', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it('should default to 2500 served entries per client address', () => {
    delete process.env.SERVED_SLOTS_PER_SOURCE;

    expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(2_500);
  });

  it.each([
    ['1', 1],
    ['2500', 2_500],
    ['100000', 100_000],
  ])('should accept %s', (raw, expected) => {
    process.env.SERVED_SLOTS_PER_SOURCE = raw;

    expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(expected);
  });

  it.each([['0'], ['-1'], ['1.5'], ['many'], ['100001']])(
    'should reject %s and name the variable',
    (raw) => {
      process.env.SERVED_SLOTS_PER_SOURCE = raw;

      expect(() => pigeonEnvironment()).toThrow(/SERVED_SLOTS_PER_SOURCE/);
    },
  );
});
