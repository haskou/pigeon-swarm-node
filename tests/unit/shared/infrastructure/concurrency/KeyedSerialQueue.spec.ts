import { KeyedSerialQueue } from '@app/shared/infrastructure/concurrency/KeyedSerialQueue';
import { setTimeout } from 'timers/promises';

const withinASecond = async <T>(pending: Promise<T>): Promise<T> =>
  Promise.race([
    pending,
    setTimeout(1000, undefined, { ref: false }).then((): never => {
      throw new Error('Still waiting after a second');
    }),
  ]);

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

  it('should refuse at once an action run on its key from inside an action on that key, naming no key', async () => {
    const queue = new KeyedSerialQueue();
    const nested = jest.fn();

    await queue.run('identity-123', async () => {
      await expect(
        withinASecond(queue.run('identity-123', nested)),
      ).rejects.toMatchObject({
        message: 'A serial section cannot be entered again from inside itself.',
      });
    });

    expect(nested).not.toHaveBeenCalled();
    await expect(
      withinASecond(queue.run('identity-123', () => Promise.resolve('free'))),
    ).resolves.toBe('free');
  });

  it('should let an action on another key run inside an action', async () => {
    const queue = new KeyedSerialQueue();

    await expect(
      withinASecond(
        queue.run('outer', () =>
          queue.run('inner', () => Promise.resolve('inner')),
        ),
      ),
    ).resolves.toBe('inner');
  });

  it('should queue, not refuse, work an action started that runs on its key after the action ended', async () => {
    const queue = new KeyedSerialQueue();
    const { promise: ended, resolve: end } = Promise.withResolvers<void>();
    const enter = (): Promise<string> =>
      queue.run('key', () => Promise.resolve('queued'));
    let later!: Promise<string>;

    await queue.run('key', () => {
      later = ended.then(enter);

      return Promise.resolve();
    });
    end();

    await expect(withinASecond(later)).resolves.toBe('queued');
  });
});
