import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Kernel } from '@haskou/ddd-kernel';

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

  it('should treat a blank value as unset, never as 0', () => {
    process.env.SERVED_SLOTS_PER_SOURCE = '';

    expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(2_500);
  });

  it.each([
    ['1', 1],
    ['2500', 2_500],
    ['10000', 10_000],
  ])('should accept %s', (raw, expected) => {
    process.env.SERVED_SLOTS_PER_SOURCE = raw;

    expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(expected);
  });

  it.each([['0'], ['-1'], ['1.5'], ['10001'], ['12abc'], ['many']])(
    'should reject %s and name the variable',
    (raw) => {
      process.env.SERVED_SLOTS_PER_SOURCE = raw;

      expect(() => pigeonEnvironment()).toThrow(/SERVED_SLOTS_PER_SOURCE/);
    },
  );

  const withKernelEnvironment = (
    environment: Record<string, unknown>,
    run: () => void,
  ): void => {
    delete process.env.JEST_WORKER_ID;
    const active = jest
      .spyOn(Kernel, 'active', 'get')
      .mockReturnValue({ environment } as unknown as Kernel);

    try {
      run();
    } finally {
      active.mockRestore();
    }
  };

  it('should read the value the kernel loaded', () => {
    withKernelEnvironment({ SERVED_SLOTS_PER_SOURCE: 7 }, () => {
      expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(7);
    });
  });

  it('should keep a valid kernel value over a blank process value', () => {
    process.env.SERVED_SLOTS_PER_SOURCE = '';

    withKernelEnvironment({ SERVED_SLOTS_PER_SOURCE: 7 }, () => {
      expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(7);
    });
  });

  it('should not let an out-of-range kernel value reach the caller', () => {
    withKernelEnvironment({ SERVED_SLOTS_PER_SOURCE: 0 }, () => {
      expect(pigeonEnvironment().SERVED_SLOTS_PER_SOURCE).toBe(2_500);
    });
  });
});
