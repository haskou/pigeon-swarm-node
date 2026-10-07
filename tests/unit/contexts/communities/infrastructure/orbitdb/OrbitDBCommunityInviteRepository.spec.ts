import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from '@app/contexts/communities/domain/value-objects/CommunityInviteNonce';
import OrbitDBCommunityInviteMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityInviteMapper';
import OrbitDBCommunityInviteRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInviteRepository';
import CommunityInviteUseMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInviteUseMutationPolicy';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityInviteRepository', () => {
  const communityId = new CommunityId('community-1');
  const creatorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=',
  );
  const otherIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  const documents: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityInviteRepository;

  beforeEach(() => {
    documents.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      heads: {
        all: jest.fn(async (): Promise<[]> => []),
        get: jest.fn(async (): Promise<undefined> => undefined),
        put: jest.fn(async () => 'ok'),
      },
      requests: {
        put: jest.fn(async (document) => {
          const record = document as Record<string, unknown>;
          const index = documents.findIndex(
            (candidate) => candidate.id === record.id,
          );

          if (index >= 0) {
            documents[index] = record;
          } else {
            documents.push(record);
          }

          return 'ok';
        }),
        query: jest.fn(async (matcher) => documents.filter(matcher)),
      },
    } as never);
    repository = new OrbitDBCommunityInviteRepository(
      registry,
      new OrbitDBCommunityInviteMapper(),
      publicStorageGuard(),
    );
  });

  it('should save community invite links and count their signed uses', async () => {
    const createdAt = new Timestamp(1780000000000);
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      new CommunityInviteNonce('nonce-0123456789abcdef'),
      createdAt,
      undefined,
      new CommunityInviteMaxUses(2),
    );
    const token = invite.getToken().valueOf();

    await repository.save(
      invite,
      await signedMutation({
        identityId: creatorIdentityId.valueOf(),
        kind: 'put',
        recordId: token,
        sequence: 1,
        store: 'requests',
      }),
    );
    const found = await repository.findByToken(invite.getToken());
    const before = await repository.countUses(invite);

    for (const identityId of [creatorIdentityId, otherIdentityId]) {
      await repository.recordUse(
        invite,
        identityId,
        createdAt,
        await signedMutation({
          identityId: identityId.valueOf(),
          kind: 'put',
          recordId: `invite-use:${token}:${identityId.valueOf()}`,
          sequence: 1,
          store: 'requests',
        }),
      );
    }

    expect(found?.toPrimitives()).toEqual(invite.toPrimitives());
    expect(before.valueOf()).toBe(0);
    expect((await repository.countUses(invite)).valueOf()).toBe(2);
  });

  it('should admit an invite use through the gate without waiting for its own community lock', async () => {
    const createdAt = new Timestamp(1780000000000);
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      new CommunityInviteNonce('nonce-0123456789abcdef'),
      createdAt,
      undefined,
      new CommunityInviteMaxUses(2),
    );
    const token = invite.getToken().valueOf();
    const requestMembership = jest.fn();

    await repository.save(
      invite,
      await signedMutation({
        identityId: creatorIdentityId.valueOf(),
        kind: 'put',
        recordId: token,
        sequence: 1,
        store: 'requests',
      }),
    );
    registry.addMutationGate(
      new PublicMutationGate(
        new PublicMutationVerifier({ isAuthorized: async () => true }),
        [
          new CommunityInviteUseMutationPolicy(
            {
              findById: async () => ({ requestMembership }),
            } as never,
            repository,
          ),
        ],
      ),
    );
    const payload = {
      communityId: communityId.valueOf(),
      id: `invite-use:${token}:${otherIdentityId.valueOf()}`,
      identityId: otherIdentityId.valueOf(),
      scopeType: 'community_invite_use',
      token,
      usedAt: createdAt.valueOf(),
    };
    const device = await KeyPair.generate();
    const body = {
      author: {
        authorizationRevision: 0,
        deviceCredential: device.toPrimitives().publicKey,
        identityId: otherIdentityId.valueOf(),
      },
      kind: 'put',
      operationId: 'operation-1'.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: null as string | null,
      recordId: payload.id,
      sequence: 0,
      store: 'requests',
      version: 2,
    } as const;

    await expect(
      Promise.race([
        repository
          .recordUse(
            invite,
            otherIdentityId,
            createdAt,
            PublicMutationProof.signed(
              body,
              device.sign(PublicMutationProof.signingContentOf(body)),
            ),
          )
          .then(() => 'recorded'),
        new Promise((resolve) => setTimeout(() => resolve('deadlock'), 3000)),
      ]),
    ).resolves.toBe('recorded');
    expect(requestMembership).toHaveBeenCalledTimes(1);
    expect((await repository.countUses(invite)).valueOf()).toBe(1);
  });
});
