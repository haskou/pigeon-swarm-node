import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import PublicMutationGate from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe('PublicMutationGate over pins', () => {
  const author = 'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const id = 'community:c1:ch1:m1';
  const pin = {
    channelId: 'ch1',
    communityId: 'c1',
    createdAt: 1780000000000,
    id,
    messageId: 'm1',
    pinnedByIdentityId: author,
    scopeType: 'community_channel',
  };
  const tombstone = {
    channelId: 'ch1',
    communityId: 'c1',
    id,
    messageId: 'm1',
    pinnedByIdentityId: author,
    removed: true,
    scopeType: 'community_channel',
  };
  const authorization = mock<PublicMutationAuthorAuthorization>();
  const communityRepository = mock<CommunityRepository>();
  let gate: PublicMutationGate;

  const sign = async (
    payload: Record<string, unknown>,
    kind: 'put' | 'delete',
    sequence: number,
  ): Promise<Record<string, unknown>> => {
    const device = await KeyPair.generate();
    const body = {
      author: {
        deviceCredential: device.toPrimitives().publicKey,
        identityId: author,
      },
      kind,
      operationId: `operation-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: PublicMutationProof.digestOf({ previous: sequence }),
      recordId: id,
      sequence,
      store: 'pins',
      version: 1,
    } as const;

    return PublicMutationRecord.withProof(
      payload,
      PublicMutationProof.signed(
        body,
        device.sign(PublicMutationProof.signingContentOf(body)),
      ),
    );
  };

  beforeEach(() => {
    authorization.isAuthorized.mockResolvedValue(true);
    communityRepository.findById.mockResolvedValue(
      mock<Community>({ manageChannelMessages: jest.fn() }),
    );
    gate = new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityChannelMessagePinMutationPolicy(communityRepository),
    ]);
  });

  it('admits a signed pin and a signed unpin', async () => {
    await expect(gate.accepts('pins', await sign(pin, 'put', 1))).resolves.toBe(
      true,
    );
    await expect(
      gate.accepts('pins', await sign(tombstone, 'delete', 2)),
    ).resolves.toBe(true);
  });

  it('rejects a forged future-dated tombstone without proof', async () => {
    await expect(
      gate.accepts('pins', { ...tombstone, updatedAt: Date.now() + 10 ** 12 }),
    ).resolves.toBe(false);
  });

  it('rejects a put proof replayed as a tombstone', async () => {
    const signed = await sign(pin, 'put', 1);

    await expect(
      gate.accepts('pins', { ...tombstone, proof: signed.proof }),
    ).resolves.toBe(false);
  });

  it('rejects a proof copied onto another scope', async () => {
    const signed = await sign(pin, 'put', 1);

    await expect(
      gate.accepts('pins', {
        ...signed,
        channelId: 'ch2',
        id: 'community:c1:ch2:m1',
      }),
    ).resolves.toBe(false);
  });

  it('rejects revoked devices and insufficient permissions', async () => {
    authorization.isAuthorized.mockResolvedValueOnce(false);
    await expect(gate.accepts('pins', await sign(pin, 'put', 1))).resolves.toBe(
      false,
    );

    communityRepository.findById.mockResolvedValue(
      mock<Community>({
        manageChannelMessages: jest.fn(() => {
          throw new Error('forbidden');
        }),
      }),
    );
    await expect(gate.accepts('pins', await sign(pin, 'put', 1))).resolves.toBe(
      false,
    );
  });

  it('keeps the signed pin when a forged tombstone is replicated', async () => {
    const registry = new OrbitDBReplicatedStateRegistry();
    const signed = await sign(pin, 'put', 1);
    const forged = { ...tombstone, updatedAt: Date.now() + 10 ** 12 };
    const documents = [signed, forged];

    await registry.register('n', {
      heads: { events: { on: jest.fn() } },
      pins: {
        query: jest.fn((matcher: (d: Record<string, unknown>) => boolean) =>
          Promise.resolve(documents.filter(matcher)),
        ),
      },
    } as never);
    registry.useMutationGate(gate);

    await expect(registry.queryDocuments('pins', () => true)).resolves.toEqual([
      signed,
    ]);
    registry.clear();
  });
});
