import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import LocalNodeBlockSourceRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockSourceRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

describe('LocalNodeBlockSourceRepository', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalNodeBlockSourceRepository;
  let publisher: KeyPair;
  let source: NodeBlockSource;

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-node-block-sources-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    repository = new LocalNodeBlockSourceRepository(database);
    publisher = await KeyPair.generate();
    source = NodeBlockSource.adopt(
      new NodeBlockListMother(publisher).ownerIdentityId(),
      new NodeBlockSourceOrigin('https://publisher.example'),
      false,
      new NodeBlockSourceVersionFloor(0),
    );
    source.receive(
      new NodeBlockListMother(publisher).withVersion(3).primitives(),
      new Timestamp(1),
    );
    await repository.save(source);
  });

  afterEach(async () => {
    await database.close();

    if (previousPath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousPath;
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('should start a publisher it never accepted a list from at floor 0', async () => {
    await expect(
      repository.versionFloor(
        await NodeBlockListMother.identityId(),
      ),
    ).resolves.toEqual(new NodeBlockSourceVersionFloor(0));
  });

  it('should keep the highest accepted version after the source is removed', async () => {
    await repository.delete(source.getOwnerIdentityId());

    await expect(repository.exists(source.getOwnerIdentityId())).resolves.toBe(
      false,
    );
    await expect(
      repository.versionFloor(source.getOwnerIdentityId()),
    ).resolves.toEqual(new NodeBlockSourceVersionFloor(3));
  });
});
