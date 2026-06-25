import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import OrbitDBCommunityModerationLogRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityModerationLogRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

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
    repository = new OrbitDBCommunityModerationLogRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should not wait for community moderation log indexes when saving logs', async () => {
    const entry = moderationLogEntry();

    headsPut.mockImplementation(
      async (key: string, value: Record<string, unknown>) => {
        if (key.startsWith('community-moderation-log-index:')) {
          return new Promise(() => undefined);
        }

        heads.set(key, value);

        return 'ok';
      },
    );

    const result = await Promise.race([
      repository.save(entry).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    expect(heads.get(`community-moderation-log:${entry.getId().valueOf()}`))
      .toEqual(expect.objectContaining({ id: entry.getId().valueOf() }));
  });

  it('should find moderation logs from fresh heads when indexes lag', async () => {
    const entry = moderationLogEntry();

    await repository.save(entry);
    heads.delete(`community-moderation-log-index:${communityId.valueOf()}`);

    const logs = await repository.findByCommunity(communityId, 10);

    expect(logs.map((log) => log.getId().valueOf())).toEqual([
      entry.getId().valueOf(),
    ]);
  });

  it('should not return deleted moderation logs from stale indexes', async () => {
    const entry = moderationLogEntry();
    const indexKey = `community-moderation-log-index:${communityId.valueOf()}`;

    await repository.save(entry);
    await flushBackgroundTasks();
    const staleIndex = heads.get(indexKey);

    await repository.deleteByCommunity(communityId);

    if (staleIndex) {
      heads.set(indexKey, staleIndex);
    }

    const logs = await repository.findByCommunity(communityId, 10);

    expect(logs).toEqual([]);
    expect(heads.get(`community-moderation-log:${entry.getId().valueOf()}`))
      .toEqual(expect.objectContaining({ deleted: true }));
  });

  function moderationLogEntry(): CommunityModerationLogEntry {
    return CommunityModerationLogEntry.record(
      communityId,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_RENAMED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        communityId,
      ),
    );
  }
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
