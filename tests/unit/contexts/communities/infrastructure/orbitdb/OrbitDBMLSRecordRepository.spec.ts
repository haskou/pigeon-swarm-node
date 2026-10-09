import { MLSRecord } from '@app/contexts/communities/domain/MLSRecord';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MLSRecordId } from '@app/contexts/communities/domain/value-objects/MLSRecordId';
import { MLSRecordKind } from '@app/contexts/communities/domain/value-objects/MLSRecordKind';
import OrbitDBMLSRecordRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBMLSRecordRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

function createStore(): {
  all: jest.Mock<Promise<Entry[]>>;
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  put: jest.Mock<Promise<string>, [string | Record<string, unknown>, unknown?]>;
  query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [(document: Record<string, unknown>) => boolean]
  >;
  events: {
    on: jest.Mock<void, ['update', () => void]>;
  };
  releaseWrites(): void;
  stopWrites(): void;
} {
  const entries = new Map<string, Record<string, unknown>>();
  const writeBlockers: Array<() => void> = [];
  let blockWrites = false;

  const store = {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    events: {
      on: jest.fn(),
    },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        if (blockWrites) {
          await new Promise<void>((resolve) => writeBlockers.push(resolve));
        }

        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);
        const document =
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument;

        entries.set(key, document);

        return key;
      },
    ),
    query: jest.fn(async (matcher) =>
      [...entries.values()].filter((document) => matcher(document)),
    ),
    releaseWrites(): void {
      blockWrites = false;
      writeBlockers.splice(0).forEach((release) => release());
    },
    stopWrites(): void {
      blockWrites = true;
    },
  };

  return store;
}

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBMLSRecordRepository', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  const communityId = new CommunityId('community-1');
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBMLSRecordRepository;

  function record(payload: string, epoch: number, community = communityId) {
    const content = {
      epoch,
      groupId: community.valueOf(),
      kind: 'commit',
      payload,
    };

    return new MLSRecord(
      MLSRecordId.derive(content),
      community,
      content.groupId,
      new MLSRecordKind('commit'),
      payload,
      identityId,
      new Timestamp(1780000000000),
      epoch,
    );
  }

  function proof(stored: MLSRecord) {
    return signedMutation({
      identityId: identityId.valueOf(),
      kind: 'put',
      recordId: `community:${stored.communityId.valueOf()}:mls:${stored.id.valueOf()}`,
      sequence: 1,
      store: 'mlsRecords',
    });
  }

  beforeEach(() => {
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      heads: createStore(),
      mlsRecords: createStore(),
    } as never);
    repository = new OrbitDBMLSRecordRepository(registry, publicStorageGuard());
  });

  afterEach(() => {
    registry.clear();
  });

  it('returns what was saved, with every field', async () => {
    const saved = record('AAEC', 4);
    await repository.save(saved, await proof(saved));

    const [found] = await repository.findByCommunity(communityId);

    expect(found.id.valueOf()).toBe(saved.id.valueOf());
    expect(found.payload).toBe('AAEC');
    expect(found.epoch).toBe(4);
    expect(found.kind.valueOf()).toBe('commit');
    expect(found.authorIdentityId.isEqual(identityId)).toBe(true);
  });

  it('keeps every record of a group and stores a republished one once', async () => {
    const first = record('AAEC', 1);
    const second = record('AAED', 2);
    await repository.save(first, await proof(first));
    await repository.save(second, await proof(second));
    await repository.save(first, await proof(first));

    await expect(repository.findByCommunity(communityId)).resolves.toHaveLength(
      2,
    );
  });

  it('does not leak records across communities', async () => {
    const saved = record('AAEC', 1);
    await repository.save(saved, await proof(saved));

    await expect(
      repository.findByCommunity(new CommunityId('community-2')),
    ).resolves.toEqual([]);
  });
});
