import { PrivateOperationAcceptance } from '@app/contexts/private-authorization/application/PrivateOperationAcceptance';
import { PrivateAuthorizationConflictError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationConflictError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import LocalPrivateAuthorizationRepository from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository';
import LocalPrivateOperationUnitOfWork from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateOperationUnitOfWork';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('LocalPrivateOperationUnitOfWork', () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalPrivateAuthorizationRepository;
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
      pendingOperations: [],
      status: 'active',
    }),
  });

  beforeEach(async () => {
    previousDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-private-uow-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    repository = new LocalPrivateAuthorizationRepository(
      database,
      new PrivateAuthorizationStorageCoordinator(),
    );
    unitOfWork = new LocalPrivateOperationUnitOfWork(database, repository);
    await repository.saveScope(
      PrivateAuthorizationScope.pin(checkpoint(), 'genesis'),
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

  it('commits a proposal without advancing the authorization checkpoint', async () => {
    const proposal = operation('membership.propose');
    const accepted = acceptance();
    accepted.receipt = proposal;
    accepted.scope = PrivateAuthorizationScope.fromPrimitives({
      acceptedOperations: [proposal.toPrimitives()],
      checkpoint: checkpoint().toPrimitives(),
      genesisHash: 'genesis',
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

  it('rejects stale checkpoints and a different child reservation', async () => {
    await repository.saveReservation('scope', 'head-0', 'other-head');

    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'old', revision: 0 },
        acceptance(),
      ),
    ).resolves.toBe('stale');
    await expect(
      unitOfWork.commitAcceptance(
        'scope',
        { headHash: 'head-0', revision: 0 },
        acceptance(),
      ),
    ).resolves.toBe('stale');
    await expect(
      repository.findReceipt('scope', 'operation'),
    ).resolves.toBeUndefined();
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
    const another = new LocalPrivateOperationUnitOfWork(database, repository);

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
