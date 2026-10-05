import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import OrbitDBCommunityModerationLogRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityModerationLogRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityModerationLogRepository', () => {
  const communityId = new CommunityId('community-1');
  const actorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=',
  );
  const heads = new Map<string, Record<string, unknown>>();
  const moderationLogs: Record<string, unknown>[] = [];
  let headsPut: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityModerationLogRepository;

  beforeEach(async () => {
    heads.clear();
    moderationLogs.splice(0);
    headsPut = jest.fn(async (key: string, value: Record<string, unknown>) => {
      heads.set(key, value);

      return 'ok';
    });
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register('network-1', {
      heads: {
        all: jest.fn(async () =>
          [...heads.entries()].map(([key, value]) => ({ key, value })),
        ),
        get: jest.fn(async (key: string) => {
          const value = heads.get(key);

          return value ? { key, value } : undefined;
        }),
        put: headsPut,
      },
      moderationLogs: {
        put: jest.fn(async (document) => {
          moderationLogs.push(document as Record<string, unknown>);

          return 'ok';
        }),
      },
    } as never);
    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
    });
    repository = new OrbitDBCommunityModerationLogRepository(
      registry,
      publicStorageGuard(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should store the signed document and index it by community', async () => {
    const entry = moderationLogEntry();

    await repository.save(entry, await proofOf(entry));

    expect(moderationLogs).toEqual([
      expect.objectContaining({
        id: entry.getId().valueOf(),
        scopeType: 'community_moderation_log',
        proof: expect.objectContaining({ store: 'moderationLogs' }),
      }),
    ]);
    expect(
      heads.get(`community-moderation-log-index:${communityId.valueOf()}`),
    ).toBeDefined();
  });

  it('should find moderation logs from the community index', async () => {
    const entry = moderationLogEntry();

    await repository.save(entry, await proofOf(entry));
    await flushBackgroundTasks();

    const logs = await repository.findByCommunity(communityId, 10);

    expect(logs.map((log) => log.getId().valueOf())).toEqual([
      entry.getId().valueOf(),
    ]);
  });

  it('should reject a mutation outranked by the stored one', async () => {
    const entry = moderationLogEntry();

    await repository.save(entry, await proofOf(entry, 2));
    await flushBackgroundTasks();

    await expect(
      repository.save(entry, await proofOf(entry, 1)),
    ).rejects.toThrow();
    expect(moderationLogs).toHaveLength(1);
  });

  function proofOf(entry: CommunityModerationLogEntry, sequence = 1) {
    return signedMutation({
      identityId: actorIdentityId.valueOf(),
      kind: 'put',
      payload: {
        ...entry.toPrimitives(),
        scopeType: 'community_moderation_log',
      },
      recordId: entry.getId().valueOf(),
      sequence,
      store: 'moderationLogs',
    });
  }

  function moderationLogEntry(): CommunityModerationLogEntry {
    return CommunityModerationLogEntry.create(
      communityId,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_RENAMED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        communityId,
      ),
      new CommunityModerationLogDetails({ name: 'general' }),
      new Timestamp(1780000000000),
    );
  }
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
