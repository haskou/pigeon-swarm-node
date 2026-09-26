import { PrivateOperationAcceptance } from '@app/contexts/private-authorization/application/PrivateOperationAcceptance';
import { PrivateAuthorizationStorageCapacityExceededError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationStorageCapacityExceededError';
import { PrivateAuthorizationConflictError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationConflictError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import LocalPrivateAuthorizationRepository from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository';
import LocalPrivateOperationUnitOfWork from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateOperationUnitOfWork';
import {
  privateAuthorizationLocalId,
  PrivateAuthorizationLocalNamespaces,
} from '@app/contexts/private-authorization/infrastructure/local-db/PrivateAuthorizationLocalNamespaces';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Buffer } from 'buffer';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('LocalPrivateOperationUnitOfWork', () => {
  const ownerIdentityId = new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({
        format: 'der',
        type: 'spki',
      })
      .toString('base64'),
  );
  const attackerIdentityId = new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({
        format: 'der',
        type: 'spki',
      })
      .toString('base64'),
  );
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalPrivateAuthorizationRepository;
  let storageCoordinator: PrivateAuthorizationStorageCoordinator;
  let unitOfWork: LocalPrivateOperationUnitOfWork;
  let previousDatabasePath: string | undefined;

  const checkpoint = (revision = 0, headHash = 'head-0') =>
    PrivateAuthorizationCheckpoint.fromPrimitives({
      admittedDeviceKeys: ['owner', 'device'],
      authorityKeys: ['owner'],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: 'owner',
      headHash,
      parentHeadHash: revision === 0 ? null : 'head-0',
      revision,
      revokedDeviceKeys: [],
      scopeId: 'scope',
    });
  const operation = (kind = 'device.revoke') =>
    PrivateControlOperation.fromPrimitives({
      authorDeviceKey: 'owner',
      authorizationRevision: 0,
      byteSize: 10,
      control: { parentHeadHash: 'head-0' },
      digest: 'digest-operation',
      id: 'operation',
      kind,
      mutation:
        kind === 'device.revoke'
          ? { deviceKey: 'device', type: 'device.revoke' }
          : { targetIdentityId: 'member', type: 'member.ban' },
      previousOperationIds: [],
      scopeId: 'scope',
    });
  const acceptance = (): PrivateOperationAcceptance => ({
    clearPendingOperationIds: ['operation'],
    outbox: {
      eventName: 'private_authorization.v1.control_operation.was_accepted',
      id: 'outbox',
      payload: { scopeId: 'scope' },
    },
    projection: { members: ['member'] },
    protectedMlsState: 'encrypted-mls-state',
    receipt: operation(),
    replayMarkerId: 'request',
    reservation: { childHeadHash: 'head-1', parentHeadHash: 'head-0' },
    scope: PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations: [operation().toPrimitives()],
      checkpoint: {
        ...checkpoint(1, 'head-1').toPrimitives(),
        admittedDeviceKeys: ['owner'],
        revokedDeviceKeys: ['device'],
      },
      genesisHash: 'genesis',
      ownerDeviceKey: 'owner',
      pendingOperations: [],
      status: 'active',
    }),
  });
  const genesis = (
    scopeId: string,
    genesisHash = 'new-genesis',
    projection: Record<string, unknown> = { id: scopeId },
    protectedMlsState = 'protected-genesis-state',
    ownerDeviceKey = 'owner',
    identityId = ownerIdentityId,
  ) => ({
    ownerIdentityId: identityId,
    projection,
    protectedMlsState,
    scope: PrivateAuthorizationScope.pin(
      PrivateAuthorizationCheckpoint.fromPrimitives({
        ...checkpoint().toPrimitives(),
        admittedDeviceKeys: [ownerDeviceKey],
        authorityKeys: [ownerDeviceKey],
        freshnessAuthorityKey: ownerDeviceKey,
        scopeId,
      }),
      genesisHash,
      new PrivateAuthorizationDeviceKey(ownerDeviceKey),
    ),
  });

  beforeEach(async () => {
    previousDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-private-uow-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    storageCoordinator = new PrivateAuthorizationStorageCoordinator();
    repository = new LocalPrivateAuthorizationRepository(
      database,
      storageCoordinator,
    );
    unitOfWork = new LocalPrivateOperationUnitOfWork(
      database,
      repository,
      storageCoordinator,
    );
    await repository.saveScope(
      PrivateAuthorizationScope.pin(checkpoint(), 'genesis'),
    );
    await database.save(
      PrivateAuthorizationLocalNamespaces.provisioning,
      'scope',
      { ownerIdentityId: ownerIdentityId.valueOf(), provisionedBytes: 1 },
    );
    await repository.savePending('scope', operation());
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

  it('atomically commits every acceptance record and removes pending input', async () => {
    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        acceptance(),
      ),
    ).resolves.toBe('committed');

    await expect(repository.findReceipt('scope', 'operation')).resolves.toEqual(
      operation().toPrimitives(),
    );
    await expect(repository.findPending('scope')).resolves.toEqual([]);
    await expect(repository.findProjection('scope')).resolves.toEqual({
      members: ['member'],
    });
    await expect(repository.findProtectedMlsState('scope')).resolves.toBe(
      'encrypted-mls-state',
    );
    await expect(repository.hasReplayMarker('scope', 'request')).resolves.toBe(
      true,
    );
    await expect(repository.findOutbox('scope')).resolves.toHaveLength(1);
  });

  it('atomically updates the scope storage reservation after acceptance', async () => {
    const before = await database.findOne(
      PrivateAuthorizationLocalNamespaces.provisioning,
      'scope',
    );
    const expanded = acceptance();
    expanded.projection = { members: ['member'], padding: 'x'.repeat(2048) };

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        expanded,
      ),
    ).resolves.toBe('committed');

    const after = await database.findOne(
      PrivateAuthorizationLocalNamespaces.provisioning,
      'scope',
    );
    const storedScope = await repository.findScope('scope');
    expect(after?.provisionedBytes).toBe(
      Buffer.byteLength(
        JSON.stringify({
          projection: expanded.projection,
          protectedMlsState: expanded.protectedMlsState,
          scope: storedScope?.toPrimitives(),
        }),
      ),
    );
    expect(Number(after?.provisionedBytes)).toBeGreaterThan(
      Number(before?.provisionedBytes),
    );
  });

  it('rejects projection growth that exceeds the owner storage quota', async () => {
    const reservation = await database.findOne(
      PrivateAuthorizationLocalNamespaces.provisioning,
      'scope',
    );
    const provisionedBytes = Number(reservation?.provisionedBytes);
    await database.save(
      PrivateAuthorizationLocalNamespaces.provisioning,
      'other-scope',
      {
        ownerIdentityId: ownerIdentityId.valueOf(),
        provisionedBytes: 32 * 1024 * 1024 - provisionedBytes - 1,
      },
    );
    const expanded = acceptance();
    expanded.projection = { members: ['member'], padding: 'x'.repeat(2048) };

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        expanded,
      ),
    ).rejects.toThrow(PrivateAuthorizationStorageCapacityExceededError);

    await expect(repository.findProjection('scope')).resolves.toBeUndefined();
    await expect(
      repository.findReceipt('scope', 'operation'),
    ).resolves.toBeUndefined();
    await expect(
      database.findOne(
        PrivateAuthorizationLocalNamespaces.provisioning,
        'scope',
      ),
    ).resolves.toEqual(reservation);
  });

  it('atomically provisions a private authorization genesis', async () => {
    const commit = genesis('new-scope');
    const databaseCommit = jest.spyOn(database, 'commit');

    await expect(
      Promise.all([
        unitOfWork.commitGenesis(commit),
        unitOfWork.commitGenesis(commit),
      ]),
    ).resolves.toEqual(['committed', 'duplicate']);
    expect(databaseCommit).toHaveBeenCalledTimes(1);
    await expect(repository.findScope('new-scope')).resolves.toBeDefined();
    await expect(repository.findProjection('new-scope')).resolves.toEqual({
      id: 'new-scope',
    });
    await expect(repository.findProtectedMlsState('new-scope')).resolves.toBe(
      'protected-genesis-state',
    );
    await expect(
      database.findOne(
        PrivateAuthorizationLocalNamespaces.provisioning,
        'new-scope',
      ),
    ).resolves.toMatchObject({
      ownerIdentityId: ownerIdentityId.valueOf(),
      provisionedBytes: expect.any(Number),
    });
  });

  it('does not share scope queues between independent node databases', async () => {
    const secondDatabasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-private-uow-second-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = secondDatabasePath;
    const secondDatabase = new EmbeddedLocalDatabase();
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    const secondCoordinator = new PrivateAuthorizationStorageCoordinator();
    const secondRepository = new LocalPrivateAuthorizationRepository(
      secondDatabase,
      secondCoordinator,
    );
    const secondUnitOfWork = new LocalPrivateOperationUnitOfWork(
      secondDatabase,
      secondRepository,
      secondCoordinator,
    );
    const originalCommit = database.commit.bind(database);
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });
    jest
      .spyOn(database, 'commit')
      .mockImplementationOnce(async (operations) => {
        firstEntered();
        await firstReleased;
        await originalCommit(operations);
      });

    const first = unitOfWork.commitGenesis(genesis('shared-scope'));
    await firstStarted;
    await expect(
      secondUnitOfWork.commitGenesis(genesis('shared-scope')),
    ).resolves.toBe('committed');
    releaseFirst();
    await expect(first).resolves.toBe('committed');
    await secondDatabase.close();
    await fs.rm(secondDatabasePath, { force: true, recursive: true });
  });

  it('waits for an in-flight public write before protecting its scope', async () => {
    const findScope = jest.spyOn(repository, 'findScope');
    let releasePublicWrite!: () => void;
    let publicWriteStarted!: () => void;
    const publicWriteReleased = new Promise<void>((resolve) => {
      releasePublicWrite = resolve;
    });
    const publicWriteEntered = new Promise<void>((resolve) => {
      publicWriteStarted = resolve;
    });
    const publicWrite = storageCoordinator.exclusively(
      'racing-scope',
      async () => {
        await expect(
          repository.findScope('racing-scope'),
        ).resolves.toBeUndefined();
        publicWriteStarted();
        await publicWriteReleased;
      },
    );

    await publicWriteEntered;
    let provisioned = false;
    const provisioning = unitOfWork
      .commitGenesis(genesis('racing-scope'))
      .then((result) => {
        provisioned = true;

        return result;
      });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(provisioned).toBe(false);
    expect(findScope).toHaveBeenCalledTimes(1);
    await expect(repository.findScope('racing-scope')).resolves.toBeUndefined();
    releasePublicWrite();
    await publicWrite;
    await expect(provisioning).resolves.toBe('committed');
  });

  it('freezes a scope when genesis provisioning conflicts', async () => {
    await unitOfWork.commitGenesis(genesis('conflicting-scope'));

    await expect(
      unitOfWork.commitGenesis(
        genesis('conflicting-scope', 'other-genesis', { id: 'other' }),
      ),
    ).rejects.toThrow(PrivateAuthorizationConflictError);
    expect(
      (await repository.findScope('conflicting-scope'))?.toPrimitives().status,
    ).toBe('frozen');
    await expect(
      repository.findProjection('conflicting-scope'),
    ).resolves.toEqual({ id: 'conflicting-scope' });
  });

  it('rejects conflicting genesis from another owner without freezing the scope', async () => {
    await unitOfWork.commitGenesis(genesis('protected-scope'));

    await expect(
      unitOfWork.commitGenesis(
        genesis(
          'protected-scope',
          'attacker-genesis',
          { id: 'protected-scope' },
          'attacker-state',
          'attacker-device',
          attackerIdentityId,
        ),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(
      (await repository.findScope('protected-scope'))?.toPrimitives().status,
    ).toBe('active');
    await expect(repository.findProjection('protected-scope')).resolves.toEqual(
      { id: 'protected-scope' },
    );
  });

  it('atomically removes pending operations invalidated by a checkpoint', async () => {
    await repository.savePending(
      'scope',
      PrivateControlOperation.fromPrimitives({
        ...operation('membership.propose').toPrimitives(),
        authorizationRevision: -1,
        digest: 'stale-digest',
        id: 'stale',
      }),
    );
    await repository.savePending(
      'scope',
      PrivateControlOperation.fromPrimitives({
        ...operation('membership.propose').toPrimitives(),
        authorDeviceKey: 'device',
        authorizationRevision: 1,
        digest: 'revoked-digest',
        id: 'revoked',
      }),
    );
    await repository.savePending(
      'scope',
      PrivateControlOperation.fromPrimitives({
        ...operation('membership.propose').toPrimitives(),
        authorizationRevision: 2,
        control: { parentHeadHash: 'head-1' },
        digest: 'future-digest',
        id: 'future',
      }),
    );

    await unitOfWork.commitAcceptance(
      'scope',
      { headHash: 'head-0', revision: 0 },
      acceptance(),
    );

    await expect(repository.findPending('scope')).resolves.toEqual([
      expect.objectContaining({
        toPrimitives: expect.any(Function),
      }),
    ]);
    expect(
      (await repository.findPending('scope')).map(
        (pending) => pending.toPrimitives().id,
      ),
    ).toEqual(['future']);
  });

  it('atomically removes durable records retired by history compaction', async () => {
    const proposals = Array.from({ length: 40 }, (_value, index) =>
      PrivateControlOperation.fromPrimitives({
        ...operation('membership.propose').toPrimitives(),
        byteSize: 1,
        digest: `proposal-digest-${index}`,
        id: `proposal-${index}`,
      }),
    );
    const oldest = proposals[0].toPrimitives();
    await repository.saveScope(
      PrivateAuthorizationScope.fromPrimitives({
        acceptedOperations: proposals.map((proposal) =>
          proposal.toPrimitives(),
        ),
        checkpoint: checkpoint().toPrimitives(),
        genesisHash: 'genesis',
        ownerDeviceKey: 'owner',
        pendingOperations: [],
        status: 'active',
      }),
    );
    await repository.saveReceipt('scope', proposals[0]);
    await repository.saveReservation(
      'scope',
      'retired-parent',
      'retired-child',
    );
    await database.save(
      PrivateAuthorizationLocalNamespaces.replay,
      privateAuthorizationLocalId('scope', 'retired-replay'),
      { operationId: oldest.id },
    );
    await database.save(
      PrivateAuthorizationLocalNamespaces.outbox,
      privateAuthorizationLocalId('scope', oldest.id),
      { eventName: 'retired', operationId: oldest.id, payload: {} },
    );
    await database.save(
      PrivateAuthorizationLocalNamespaces.reservations,
      privateAuthorizationLocalId('scope', 'retired-parent'),
      { childHeadHash: 'retired-child', operationId: oldest.id },
    );
    const revocation = operation();
    const nextScope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations: proposals.map((proposal) => proposal.toPrimitives()),
      checkpoint: checkpoint().toPrimitives(),
      genesisHash: 'genesis',
      ownerDeviceKey: 'owner',
      pendingOperations: [],
      status: 'active',
    });
    nextScope.revokeDevice(
      revocation,
      PrivateAuthorizationCheckpoint.fromPrimitives({
        ...checkpoint(1, 'head-1').toPrimitives(),
        admittedDeviceKeys: ['owner'],
        revokedDeviceKeys: ['device'],
      }),
    );
    const compactingAcceptance: PrivateOperationAcceptance = {
      ...acceptance(),
      clearPendingOperationIds: [revocation.toPrimitives().id],
      outbox: {
        eventName: 'private_authorization.v1.control_operation.was_accepted',
        id: revocation.toPrimitives().id,
        payload: {},
      },
      receipt: revocation,
      replayMarkerId: 'current-replay',
      scope: nextScope,
    };

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        compactingAcceptance,
      ),
    ).resolves.toBe('committed');

    await expect(
      repository.findReceipt('scope', oldest.id),
    ).resolves.toBeUndefined();
    await expect(
      repository.hasReplayMarker('scope', 'retired-replay'),
    ).resolves.toBe(false);
    await expect(
      repository.findReservation('scope', 'retired-parent'),
    ).resolves.toBeUndefined();
    await expect(repository.findOutbox('scope')).resolves.toHaveLength(1);
  });

  it('commits a proposal without advancing the authorization checkpoint', async () => {
    const proposal = operation('membership.propose');
    const accepted = acceptance();
    accepted.receipt = proposal;
    accepted.scope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations: [proposal.toPrimitives()],
      checkpoint: checkpoint().toPrimitives(),
      genesisHash: 'genesis',
      ownerDeviceKey: 'owner',
      pendingOperations: [],
      status: 'active',
    });
    delete accepted.reservation;

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        accepted,
      ),
    ).resolves.toBe('committed');
  });

  it('preserves both proposals accepted concurrently at the same checkpoint', async () => {
    const proposalAcceptance = (id: string): PrivateOperationAcceptance => {
      const proposal = PrivateControlOperation.fromPrimitives({
        ...operation('membership.propose').toPrimitives(),
        digest: `digest-${id}`,
        id,
      });

      return {
        ...acceptance(),
        clearPendingOperationIds: [id],
        outbox: {
          eventName: 'private_authorization.v1.control_operation.was_accepted',
          id,
          payload: {},
        },
        receipt: proposal,
        replayMarkerId: `replay-${id}`,
        reservation: undefined,
        scope: PrivateAuthorizationScope.fromPrimitives({
          acceptedOperations: [proposal.toPrimitives()],
          checkpoint: checkpoint().toPrimitives(),
          genesisHash: 'genesis',
          ownerDeviceKey: 'owner',
          pendingOperations: [],
          status: 'active',
        }),
      };
    };

    await expect(
      Promise.all([
        unitOfWork.commitAcceptance(
          'scope',
          { headHash: 'head-0', revision: 0 },
          proposalAcceptance('proposal-a'),
        ),
        unitOfWork.commitAcceptance(
          'scope',
          { headHash: 'head-0', revision: 0 },
          proposalAcceptance('proposal-b'),
        ),
      ]),
    ).resolves.toEqual(['committed', 'committed']);
    await expect(repository.findScope('scope')).resolves.toEqual(
      expect.objectContaining({ toPrimitives: expect.any(Function) }),
    );
    const stored = await repository.findScope('scope');
    expect(
      stored
        ?.toPrimitives()
        .acceptedOperations.map(({ id }) => id)
        .sort(),
    ).toEqual(['proposal-a', 'proposal-b']);
  });

  it('preserves a proposal committed before a transition at the same checkpoint', async () => {
    const proposal = PrivateControlOperation.fromPrimitives({
      ...operation('membership.propose').toPrimitives(),
      digest: 'proposal-digest',
      id: 'proposal',
    });
    const proposalAcceptance: PrivateOperationAcceptance = {
      ...acceptance(),
      clearPendingOperationIds: ['proposal'],
      receipt: proposal,
      reservation: undefined,
      scope: PrivateAuthorizationScope.fromPrimitives({
        acceptedOperations: [proposal.toPrimitives()],
        checkpoint: checkpoint().toPrimitives(),
        genesisHash: 'genesis',
        ownerDeviceKey: 'owner',
        pendingOperations: [],
        status: 'active',
      }),
    };
    const revocation = PrivateControlOperation.fromPrimitives({
      ...operation('device.revoke').toPrimitives(),
      digest: 'revocation-digest',
      id: 'revocation',
      mutation: { deviceKey: 'device', type: 'device.revoke' },
    });
    const revocationAcceptance: PrivateOperationAcceptance = {
      ...acceptance(),
      clearPendingOperationIds: ['revocation'],
      receipt: revocation,
      scope: PrivateAuthorizationScope.fromPrimitives({
        acceptedOperations: [revocation.toPrimitives()],
        checkpoint: {
          ...checkpoint(1, 'head-1').toPrimitives(),
          admittedDeviceKeys: ['owner'],
          revokedDeviceKeys: ['device'],
        },
        genesisHash: 'genesis',
        ownerDeviceKey: 'owner',
        pendingOperations: [],
        status: 'active',
      }),
    };

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        proposalAcceptance,
      ),
    ).resolves.toBe('committed');
    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        revocationAcceptance,
      ),
    ).resolves.toBe('committed');

    expect(
      (await repository.findScope('scope'))
        ?.toPrimitives()
        .acceptedOperations.map(({ id }) => id),
    ).toEqual(['proposal', 'revocation']);
  });

  it('durably freezes a scope when concurrent receipts reuse an operation id', async () => {
    const conflicting = acceptance();
    conflicting.receipt = PrivateControlOperation.fromPrimitives({
      ...operation().toPrimitives(),
      digest: 'conflicting-digest',
    });

    const results = await Promise.allSettled([
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        acceptance(),
      ),
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        conflicting,
      ),
    ]);

    expect(results[0]).toEqual({ status: 'fulfilled', value: 'committed' });
    expect(results[1]).toEqual({
      reason: expect.any(PrivateAuthorizationConflictError),
      status: 'rejected',
    });
    expect((await repository.findScope('scope'))?.toPrimitives().status).toBe(
      'frozen',
    );
  });

  it('persists quarantine when a rebase finds a conflicting pending operation', async () => {
    const proposal = PrivateControlOperation.fromPrimitives({
      ...operation('membership.propose').toPrimitives(),
      digest: 'accepted-digest',
      id: 'conflicting-proposal',
    });
    const conflictingPending = PrivateControlOperation.fromPrimitives({
      ...proposal.toPrimitives(),
      digest: 'pending-digest',
    });
    const accepted: PrivateOperationAcceptance = {
      ...acceptance(),
      clearPendingOperationIds: [proposal.toPrimitives().id],
      receipt: proposal,
      reservation: undefined,
      scope: PrivateAuthorizationScope.fromPrimitives({
        acceptedOperations: [proposal.toPrimitives()],
        checkpoint: checkpoint().toPrimitives(),
        genesisHash: 'genesis',
        ownerDeviceKey: 'owner',
        pendingOperations: [],
        status: 'active',
      }),
    };
    await repository.savePending('scope', conflictingPending);

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        accepted,
      ),
    ).rejects.toThrow(PrivateAuthorizationConflictError);
    expect((await repository.findScope('scope'))?.toPrimitives().status).toBe(
      'frozen',
    );
  });

  it('does not save pending work over a newer checkpoint', async () => {
    await unitOfWork.commitAcceptance(
      'scope',
      { headHash: 'head-0', revision: 0 },
      acceptance(),
    );

    await expect(
      unitOfWork.commitPending(
        'scope',
        { headHash: 'head-0', revision: 0 },
        PrivateControlOperation.fromPrimitives({
          ...operation('membership.propose').toPrimitives(),
          authorizationRevision: 2,
          digest: 'future',
          id: 'future',
        }),
      ),
    ).resolves.toBe('stale');
    expect(
      (await repository.findScope('scope'))?.toPrimitives().checkpoint,
    ).toMatchObject({ headHash: 'head-1', revision: 1 });
  });

  it('durably freezes a scope when another child was reserved for the parent', async () => {
    await repository.saveReservation('scope', 'head-0', 'other-head');

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        acceptance(),
      ),
    ).rejects.toBeInstanceOf(PrivateAuthorizationConflictError);
    await expect(
      repository.findReceipt('scope', 'operation'),
    ).resolves.toBeUndefined();
    expect((await repository.findScope('scope'))?.toPrimitives().status).toBe(
      'frozen',
    );
  });

  it('freezes a sibling arriving after the winning child advanced the checkpoint', async () => {
    await unitOfWork.commitAcceptance(
      'scope',
      { headHash: 'head-0', revision: 0 },
      acceptance(),
    );
    const sibling = acceptance();
    sibling.receipt = PrivateControlOperation.fromPrimitives({
      ...operation().toPrimitives(),
      digest: 'sibling-digest',
      id: 'sibling',
    });
    sibling.scope = PrivateAuthorizationScope.fromPrimitives({
      ...sibling.scope.toPrimitives(),
      acceptedOperations: [sibling.receipt.toPrimitives()],
      checkpoint: {
        ...sibling.scope.toPrimitives().checkpoint,
        headHash: 'head-2',
      },
    });
    sibling.reservation = {
      childHeadHash: 'head-2',
      parentHeadHash: 'head-0',
    };

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        sibling,
      ),
    ).rejects.toBeInstanceOf(PrivateAuthorizationConflictError);
    expect((await repository.findScope('scope'))?.toPrimitives()).toMatchObject(
      {
        checkpoint: { headHash: 'head-1' },
        status: 'frozen',
      },
    );
  });

  it('serializes concurrent compare-and-swap acceptance per scope', async () => {
    const first = unitOfWork.commitAcceptance(
      'scope',
      { headHash: 'head-0', revision: 0 },
      acceptance(),
    );
    const second = unitOfWork.commitAcceptance(
      'scope',
      { headHash: 'head-0', revision: 0 },
      {
        ...acceptance(),
        receipt: PrivateControlOperation.fromPrimitives({
          ...operation().toPrimitives(),
          digest: 'second-digest',
          id: 'second',
        }),
      },
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      'committed',
      'stale',
    ]);
  });

  it('durably reserves only one child per parent across unit-of-work instances', async () => {
    const another = new LocalPrivateOperationUnitOfWork(
      database,
      repository,
      storageCoordinator,
    );

    await expect(
      Promise.all([
        unitOfWork.reserveChild('scope', 'head-0', 'head-1'),
        another.reserveChild('scope', 'head-0', 'head-2'),
      ]),
    ).resolves.toEqual(['reserved', 'conflict']);
    await expect(
      another.reserveChild('scope', 'head-0', 'head-1'),
    ).resolves.toBe('same');
  });

  it('returns an identical committed receipt without executing the transition twice', async () => {
    const accepted = acceptance();
    await unitOfWork.commitAcceptance(
      'scope',
      { headHash: 'head-0', revision: 0 },
      accepted,
    );

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        accepted,
      ),
    ).resolves.toBe('committed');
    await expect(repository.findOutbox('scope')).resolves.toHaveLength(1);
  });

  it('leaves the entire previous state unchanged when the batch fails', async () => {
    const invalid = acceptance();
    invalid.projection = { invalid: BigInt(1) };

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        invalid,
      ),
    ).rejects.toThrow();
    await expect(
      repository.findReceipt('scope', 'operation'),
    ).resolves.toBeUndefined();
    await expect(repository.findScope('scope')).resolves.toEqual(
      expect.objectContaining({ toPrimitives: expect.any(Function) }),
    );
    await expect(repository.findProjection('scope')).resolves.toBeUndefined();
    await expect(repository.findPending('scope')).resolves.toHaveLength(1);
  });
});
