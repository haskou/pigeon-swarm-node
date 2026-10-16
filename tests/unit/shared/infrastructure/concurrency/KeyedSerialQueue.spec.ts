import { KeyedSerialQueue } from '@app/shared/infrastructure/concurrency/KeyedSerialQueue';

describe('KeyedSerialQueue', () => {
  const tick = async (): Promise<void> => {
    const { promise, resolve } = Promise.withResolvers<void>();

    setImmediate(resolve);

    return promise;
  };

  it('should run actions on one key one at a time in arrival order', async () => {
    const queue = new KeyedSerialQueue();
    const events: string[] = [];
    const action = (name: string) => async (): Promise<void> => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
    };

    await Promise.all([
      queue.run('key', action('first')),
      queue.run('key', action('second')),
      queue.run('key', action('third')),
    ]);

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
      'third:start',
      'third:end',
    ]);
  });

  it('should run actions on different keys in parallel', async () => {
    const queue = new KeyedSerialQueue();
    const events: string[] = [];
    const action = (name: string) => async (): Promise<void> => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
    };

    await Promise.all([
      queue.run('one', action('one')),
      queue.run('two', action('two')),
    ]);

    expect(events.slice(0, 2)).toEqual(['one:start', 'two:start']);
  });

  it('should keep serving a key after an action fails', async () => {
    const queue = new KeyedSerialQueue();

    await expect(
      queue.run('key', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(queue.run('key', async () => 'next')).resolves.toBe('next');
  });
});
