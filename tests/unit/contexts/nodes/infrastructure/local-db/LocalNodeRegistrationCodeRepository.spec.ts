import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import LocalNodeRegistrationCodeRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeRegistrationCodeRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Integer, Timestamp } from '@haskou/value-objects';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

describe('LocalNodeRegistrationCodeRepository', () => {
  const previousPath = process.env.PIGEON_LOCAL_DB_PATH;
  const now = Timestamp.now();
  const secret = NodeRegistrationCodeSecret.generate();
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalNodeRegistrationCodeRepository;

  const issue = (maxUses: number): NodeRegistrationCode =>
    NodeRegistrationCode.issue(
      secret,
      new Integer(maxUses),
      now.addDays(1),
      new NodeRegistrationCodeLimits(100, 30),
      now,
    );

  beforeEach(async () => {
    databasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-node-registration-codes-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    database = new EmbeddedLocalDatabase();
    repository = new LocalNodeRegistrationCodeRepository(database);
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

  it('should save codes without the code itself', async () => {
    const code = issue(2);

    await repository.save(code);

    const stored = await database.find('node_registration_codes', () => true);

    expect(JSON.stringify(stored)).not.toContain(secret.valueOf());
    expect(
      (await repository.findAll()).map((found) => found.toPrimitives()),
    ).toEqual([code.toPrimitives()]);
  });

  it('should reserve a use of the code matching the hash', async () => {
    await repository.save(issue(2));

    const reserved = await repository.reserveUse(secret.hash(), now);
    const [stored] = await repository.findAll();

    expect(reserved?.toPrimitives().usesLeft).toBe(1);
    expect(stored.toPrimitives().usesLeft).toBe(1);
  });

  it('should not reserve an unknown code', async () => {
    await repository.save(issue(2));

    await expect(
      repository.reserveUse(NodeRegistrationCodeSecret.generate().hash(), now),
    ).resolves.toBeUndefined();
  });

  it('should not reserve an expired code', async () => {
    await repository.save(issue(2));

    await expect(
      repository.reserveUse(secret.hash(), now.addDays(1)),
    ).resolves.toBeUndefined();
  });

  it('should let only one of concurrent requests take the last use', async () => {
    await repository.save(issue(1));

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.reserveUse(secret.hash(), now),
      ),
    );

    expect(results.filter((result) => result !== undefined)).toHaveLength(1);
    expect((await repository.findAll())[0].toPrimitives().usesLeft).toBe(0);
  });

  it('should give a released use back', async () => {
    const code = issue(1);

    await repository.save(code);
    await repository.reserveUse(secret.hash(), now);
    await repository.releaseUse(code.getId());

    await expect(
      repository.reserveUse(secret.hash(), now),
    ).resolves.toBeDefined();
  });

  it('should remove a code', async () => {
    const code = issue(1);

    await repository.save(code);
    await repository.remove(code.getId());

    await expect(repository.findAll()).resolves.toEqual([]);
    await expect(
      repository.reserveUse(secret.hash(), now),
    ).resolves.toBeUndefined();
  });
  it('should remove only expired codes', async () => {
    const expiredSecret = NodeRegistrationCodeSecret.generate();
    const live = issue(1);
    const expired = NodeRegistrationCode.fromPrimitives({
      expiresAt: now.valueOf() - 1,
      hash: expiredSecret.hash().valueOf(),
      id: NodeRegistrationCodeId.generate().valueOf(),
      maxUses: 1,
      usesLeft: 1,
    });

    await repository.save(live);
    await repository.save(expired);
    await repository.removeExpired(now);

    const remaining = await repository.findAll();

    expect(remaining.map((code) => code.getId().valueOf())).toEqual([
      live.getId().valueOf(),
    ]);
  });

  it('should keep a used-up code so its released use comes back', async () => {
    const code = issue(1);

    await repository.save(code);
    await repository.reserveUse(secret.hash(), now);
    await repository.removeExpired(now);
    await repository.releaseUse(code.getId());

    await expect(
      repository.reserveUse(secret.hash(), now),
    ).resolves.toBeDefined();
  });
});
