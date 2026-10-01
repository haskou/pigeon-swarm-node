import DeviceAuthorizationTransitionRateLimiter from '@app/apps/apis/identity-devices-api/DeviceAuthorizationTransitionRateLimiter';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe(DeviceAuthorizationTransitionRateLimiter.name, () => {
  const { IDENTITY_LIMIT, NODE_LIMIT, WINDOW_MS } =
    DeviceAuthorizationTransitionRateLimiter;

  async function identities(count: number): Promise<IdentityId[]> {
    const pairs = await Promise.all(
      Array.from({ length: count }, () => KeyPair.generate()),
    );

    return pairs.map((pair) => new IdentityId(pair.toPrimitives().publicKey));
  }

  it('rejects an identity above its window limit and recovers after the window', async () => {
    const limiter = new DeviceAuthorizationTransitionRateLimiter();
    const [id, other] = await identities(2);

    for (let i = 0; i < IDENTITY_LIMIT; i++) {
      limiter.consume(id, 1000);
    }

    expect(() => limiter.consume(id, 1001)).toThrow(
      'Device authorization transition rate limit exceeded.',
    );
    expect(() => limiter.consume(other, 1001)).not.toThrow();
    expect(() => limiter.consume(id, 1000 + WINDOW_MS)).not.toThrow();
  });

  it('bounds the whole node across many distinct identities', async () => {
    const limiter = new DeviceAuthorizationTransitionRateLimiter();
    const ids = await identities(NODE_LIMIT + 1);

    ids.slice(0, NODE_LIMIT).forEach((id) => limiter.consume(id, 1000));

    expect(() => limiter.consume(ids[NODE_LIMIT], 1000)).toThrow(
      'Device authorization transition rate limit exceeded.',
    );
  });
});
