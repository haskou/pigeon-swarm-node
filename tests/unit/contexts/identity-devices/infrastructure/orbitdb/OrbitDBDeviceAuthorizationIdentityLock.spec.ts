import OrbitDBDeviceAuthorizationIdentityLock from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationIdentityLock';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe(OrbitDBDeviceAuthorizationIdentityLock.name, () => {
  async function identityId(): Promise<IdentityId> {
    return new IdentityId((await KeyPair.generate()).toPrimitives().publicKey);
  }

  it('runs operations for the same identity one at a time in call order', async () => {
    const lock = new OrbitDBDeviceAuthorizationIdentityLock();
    const id = await identityId();
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;

    const first = lock.run(id, async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
    });
    const second = lock.run(id, () => {
      events.push('second');

      return Promise.resolve();
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['first:start']);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('does not block other identities and releases after a failure', async () => {
    const lock = new OrbitDBDeviceAuthorizationIdentityLock();
    const id = await identityId();
    const other = await identityId();

    await expect(
      lock.run(id, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(lock.run(id, () => Promise.resolve('next'))).resolves.toBe(
      'next',
    );
    await expect(lock.run(other, () => Promise.resolve('other'))).resolves.toBe(
      'other',
    );
  });
});
