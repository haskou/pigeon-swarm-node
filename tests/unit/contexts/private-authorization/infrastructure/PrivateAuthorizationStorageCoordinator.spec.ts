import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('PrivateAuthorizationStorageCoordinator', () => {
  let coordinator: PrivateAuthorizationStorageCoordinator;

  beforeEach(() => {
    coordinator = new PrivateAuthorizationStorageCoordinator();
  });

  it('serializes the work of one scope', async () => {
    const order: string[] = [];

    await Promise.all([
      coordinator.exclusively('scope-1', async () => {
        order.push('first:start');
        await pause(20);
        order.push('first:end');
      }),
      coordinator.exclusively('scope-1', async () => {
        order.push('second:start');
        order.push('second:end');
      }),
    ]);

    expect(order).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });

  it('lets the holder of a scope take it again instead of waiting for itself', async () => {
    await expect(
      Promise.race([
        coordinator.exclusively('scope-1', () =>
          coordinator.exclusively('scope-1', async () => {
            await pause(5);

            return coordinator.exclusivelyAll(['scope-1'], () =>
              Promise.resolve('nested'),
            );
          }),
        ),
        pause(2000).then(() => 'deadlock'),
      ]),
    ).resolves.toBe('nested');
  });

  it('keeps excluding other callers while the holder re-enters', async () => {
    const order: string[] = [];

    await Promise.all([
      coordinator.exclusively('scope-1', async () => {
        await coordinator.exclusively('scope-1', async () => {
          await pause(20);
          order.push('holder');
        });
      }),
      pause(5).then(() =>
        coordinator.exclusively('scope-1', async () => {
          order.push('other');
        }),
      ),
    ]);

    expect(order).toEqual(['holder', 'other']);
  });

  it('does not extend the hold to other scopes or after release', async () => {
    const order: string[] = [];

    await coordinator.exclusively('scope-1', async () => {
      await coordinator.exclusively('scope-2', async () => {
        order.push('scope-2');
      });
    });
    await Promise.all([
      coordinator.exclusively('scope-2', async () => {
        await pause(20);
        order.push('first');
      }),
      coordinator.exclusively('scope-2', async () => {
        order.push('second');
      }),
    ]);

    expect(order).toEqual(['scope-2', 'first', 'second']);
  });
});
