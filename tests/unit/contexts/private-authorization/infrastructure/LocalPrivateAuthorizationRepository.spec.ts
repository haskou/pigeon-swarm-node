import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import LocalPrivateAuthorizationRepository from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository';
import { PrivateAuthorizationLocalNamespaces } from '@app/contexts/private-authorization/infrastructure/local-db/PrivateAuthorizationLocalNamespaces';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('LocalPrivateAuthorizationRepository', () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let coordinator: PrivateAuthorizationStorageCoordinator;
  let previousDatabasePath: string | undefined;

  const checkpoint = () =>
    PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: ['owner'],
      authorityKeys: ['owner'],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: 'owner',
      headHash: 'head-0',
      scopeId: 'scope',
    });
  const operation = (id: string) =>
    PrivateControlOperation.fromPrimitives({
      authorDeviceKey: 'owner',
      authorizationRevision: 1,
      byteSize: 10,
      control: { parentHeadHash: 'head-0' },
      digest: `digest-${id}`,
      id,
      kind: 'membership.propose',
      mutation: { targetIdentityId: 'member', type: 'member.ban' },
      previousOperationIds: [],
      scopeId: 'scope',
    });

  beforeEach(async () => {
    previousDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-private-authorization-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    coordinator = new PrivateAuthorizationStorageCoordinator();
  });

  afterEach(async () => {
    await database.close();

    if (previousDatabasePath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousDatabasePath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('hydrates a scope and its bounded pending frames after restart', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    const scope = PrivateAuthorizationScope.pin(checkpoint(), 'genesis');
    scope.pullDomainEvents();
    scope.acceptProposal(operation('future'));

    await repository.saveScope(scope);
    await repository.savePending('scope', operation('second'));
    await database.close();
    database = new EmbeddedLocalDatabase();
    const restarted = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );

    await expect(restarted.findScope('scope')).resolves.toEqual(
      expect.objectContaining({
        toPrimitives: expect.any(Function),
      }),
    );
    await expect(restarted.findPending('scope')).resolves.toHaveLength(2);
  });

  it('enumerates only persisted protected scope identifiers', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    await repository.saveScope(
      PrivateAuthorizationScope.pin(checkpoint(), 'genesis'),
    );
    await repository.saveProjection('orphan', { id: 'orphan' });

    await expect(repository.findScopeIds()).resolves.toEqual(['scope']);
  });

  it('keeps receipts, reservations and projections scoped by opaque keys', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    const receipt = operation('accepted');

    await repository.saveReceipt('scope', receipt);
    await repository.saveReservation(
      'scope',
      'head-0',
      'head-1',
      'accepted',
      'owner',
      checkpoint(),
    );
    await repository.saveProjection('scope', { members: ['member'] });

    await expect(repository.findReceipt('scope', 'accepted')).resolves.toEqual(
      receipt.toPrimitives(),
    );
    const reservation = await repository.findReservation('scope', 'head-0');

    expect(reservation?.toPrimitives()).toEqual({
      authorDeviceKey: 'owner',
      childHeadHash: 'head-1',
      operationId: 'accepted',
      parentCheckpoint: checkpoint().toPrimitives(),
    });
    await expect(repository.findProjection('scope')).resolves.toEqual({
      members: ['member'],
    });
  });

  it.each([
    ['another-scope', 'head-0'],
    ['scope', 'another-head'],
  ])(
    'rejects a reservation whose retained checkpoint does not match its key',
    async (scopeId, parentHeadHash) => {
      const repository = new LocalPrivateAuthorizationRepository(
        database,
        coordinator,
      );

      await expect(
        repository.saveReservation(
          scopeId,
          parentHeadHash,
          'head-1',
          'operation',
          'owner',
          checkpoint(),
        ),
      ).rejects.toThrow('Invalid private authorization');
    },
  );

  it('fails closed when a persisted reservation contains another parent checkpoint', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    await database.save(
      PrivateAuthorizationLocalNamespaces.reservations,
      'scope:head-0',
      {
        authorDeviceKey: 'owner',
        childHeadHash: 'head-1',
        operationId: 'operation',
        parentCheckpoint: {
          ...checkpoint().toPrimitives(),
          headHash: 'another-head',
        },
      },
    );

    await expect(
      repository.findReservation('scope', 'head-0'),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('fails closed when a persisted protected scope cannot be hydrated', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    await database.save(PrivateAuthorizationLocalNamespaces.scopes, 'scope', {
      checkpoint: { scopeId: 'scope' },
      genesisHash: 'genesis',
      status: 'active',
    });

    await expect(repository.findScope('scope')).rejects.toThrow(
      'Invalid private authorization',
    );
  });

  it('finishes an admitted public write before pinning the scope', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    const guard = new PrivateCommunityPublicStorageGuard(
      repository,
      coordinator,
    );
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const write = guard.runWhilePublic(new CommunityId('scope'), async () => {
      writeStarted();
      await release;
    });
    await started;
    let pinned = false;
    const pin = repository
      .saveScope(PrivateAuthorizationScope.pin(checkpoint(), 'genesis'))
      .then(() => {
        pinned = true;
      });
    await Promise.resolve();

    expect(pinned).toBe(false);
    releaseWrite();
    await Promise.all([write, pin]);
    await expect(
      guard.runWhilePublic(
        new CommunityId('scope'),
        async (): Promise<void> => undefined,
      ),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('waits for admitted background publications before pinning the scope', async () => {
    const repository = new LocalPrivateAuthorizationRepository(
      database,
      coordinator,
    );
    const guard = new PrivateCommunityPublicStorageGuard(
      repository,
      coordinator,
    );
    let releaseBackground!: () => void;
    let backgroundStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      backgroundStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseBackground = resolve;
    });

    await guard.runWhilePublic(new CommunityId('scope'), () => {
      guard.runInBackgroundWhilePublic(
        new CommunityId('scope'),
        async () => {
          backgroundStarted();
          await release;
        },
      );

      return Promise.resolve();
    });
    await started;
    let pinned = false;
    const pin = repository
      .saveScope(PrivateAuthorizationScope.pin(checkpoint(), 'genesis'))
      .then(() => {
        pinned = true;
      });
    await Promise.resolve();

    expect(pinned).toBe(false);
    releaseBackground();
    await pin;
    expect(pinned).toBe(true);
  });
});
