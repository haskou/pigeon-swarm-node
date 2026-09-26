import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import LocalPrivateAuthorizationRepository from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('LocalPrivateAuthorizationRepository', () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
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
    const repository = new LocalPrivateAuthorizationRepository(database);
    const scope = PrivateAuthorizationScope.pin(checkpoint(), 'genesis');
    scope.pullDomainEvents();
    scope.acceptProposal(operation('future'));

    await repository.saveScope(scope);
    await repository.savePending('scope', operation('second'));
    await database.close();
    database = new EmbeddedLocalDatabase();
    const restarted = new LocalPrivateAuthorizationRepository(database);

    await expect(restarted.findScope('scope')).resolves.toEqual(
      expect.objectContaining({
        toPrimitives: expect.any(Function),
      }),
    );
    await expect(restarted.findPending('scope')).resolves.toHaveLength(2);
  });

  it('keeps receipts, reservations and projections scoped by opaque keys', async () => {
    const repository = new LocalPrivateAuthorizationRepository(database);
    const receipt = operation('accepted');

    await repository.saveReceipt('scope', receipt);
    await repository.saveReservation('scope', 'head-0', 'head-1');
    await repository.saveProjection('scope', { members: ['member'] });

    await expect(repository.findReceipt('scope', 'accepted')).resolves.toEqual(
      receipt.toPrimitives(),
    );
    await expect(
      repository.findReservation('scope', 'head-0'),
    ).resolves.toBe('head-1');
    await expect(repository.findProjection('scope')).resolves.toEqual({
      members: ['member'],
    });
  });
});
