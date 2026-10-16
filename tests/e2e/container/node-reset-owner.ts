import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';
import LocalNodeBlockListRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeBlockListRepository';
import LocalNodeRegistrationCodeRepository from '@app/contexts/nodes/infrastructure/local-db/LocalNodeRegistrationCodeRepository';
import LocalNodeMetadataMapper from '@app/contexts/nodes/infrastructure/local-db/mappers/LocalNodeMetadataMapper';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Integer, Timestamp } from '@haskou/value-objects';
import { Level } from 'level';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NetworkMother } from '../../unit/mothers/NetworkMother';
import { NodeBlockListMother } from '../../unit/mothers/NodeBlockListMother';
import { NodeMother } from '../../unit/mothers/NodeMother';

/**
 * Runs the compiled `yarn node:reset-owner <new owner identity id>` command
 * against a claimed node's local database: without a valid new owner, while
 * another process holds the database, as a running node does, and then on the
 * stopped node. Run `yarn build` first.
 */

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const ENTRY_POINT = path.join(REPOSITORY_ROOT, 'dist', 'reset-node-owner.js');
const EXIT_TIMEOUT_MS = 60_000;

type ExitResult = {
  code: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

type StoredState = {
  blockList?: Record<string, unknown>;
  codes: number;
  identity?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function withDatabase<T>(
  databasePath: string,
  use: (database: EmbeddedLocalDatabase) => Promise<T>,
): Promise<T> {
  process.env.PIGEON_LOCAL_DB_PATH = databasePath;
  const database = new EmbeddedLocalDatabase();

  return use(database).finally(() => database.close());
}

async function seedClaimedNode(databasePath: string): Promise<IdentityId> {
  const ownerKeyPair = await KeyPair.generate();
  const owner = new IdentityId(ownerKeyPair.toPrimitives().publicKey);
  const network = new NetworkMother().withPrivateKey();
  const node = new NodeMother()
    .withNetwork(network.id, network.build())
    .withOwner(owner)
    .withRegistrationMode(NodeRegistrationMode.CODES)
    .build();
  const now = Timestamp.now();

  await withDatabase(databasePath, async (database) => {
    const codes = new LocalNodeRegistrationCodeRepository(database);

    await database.save(
      'node_metadata',
      'local',
      new LocalNodeMetadataMapper().toDocument(node),
    );

    for (let index = 0; index < 2; index++) {
      await codes.save(
        NodeRegistrationCode.issue(
          NodeRegistrationCodeSecret.generate(),
          new Integer(3),
          now.addDays(1),
          new NodeRegistrationCodeLimits(100, 30),
          now,
        ),
      );
    }

    await new LocalNodeBlockListRepository(database).saveLocal(
      new NodeBlockListMother(ownerKeyPair)
        .withVersion(4)
        .blockingIdentities([await NodeBlockListMother.identityId()])
        .build(),
    );
    await database.save('identities', 'someone', { name: 'kept' });
  });

  return owner;
}

function readState(databasePath: string): Promise<StoredState> {
  return withDatabase(databasePath, async (database) => ({
    blockList: await database.findOne('node_block_list', 'local'),
    codes: (await database.find('node_registration_codes')).length,
    identity: await database.findOne('identities', 'someone'),
    metadata: await database.findOne('node_metadata', 'local'),
  }));
}

function runResetCommand(
  environment: Record<string, string>,
  args: string[],
): Promise<ExitResult> {
  const { promise, reject, resolve } = Promise.withResolvers<ExitResult>();
  const child = spawn(process.execPath, [ENTRY_POINT, ...args], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      NODE_ENV: '',
      TRANSPORT_DSN: 'in-memory://',
      ...environment,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, EXIT_TIMEOUT_MS);

  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.once('error', (error) => {
    clearTimeout(deadline);
    reject(error);
  });
  child.once('close', (code) => {
    clearTimeout(deadline);
    resolve({ code, stderr, stdout, timedOut });
  });

  return promise;
}

function describe(result: ExitResult): string {
  return `exit ${result.code}; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

async function refusesWithoutAValidNewOwner(
  databasePath: string,
  environment: Record<string, string>,
  currentOwner: IdentityId,
): Promise<void> {
  const before = await readState(databasePath);
  const runningNode = new Level(databasePath, { valueEncoding: 'json' });
  const refusals: [string[], string][] = [
    [
      [],
      'Name the new node owner: yarn node:reset-owner <new owner identity id>',
    ],
    [
      ['not-an-identity'],
      'The new node owner must be an identity id: yarn node:reset-owner <new owner identity id>',
    ],
  ];

  // The arguments are checked before the database is opened: even a running
  // node's lock is not reached.
  await runningNode.open();
  try {
    for (const [args, message] of refusals) {
      const result = await runResetCommand(environment, args);

      assert.equal(result.timedOut, false, `command hung; ${describe(result)}`);
      assert.equal(result.code, 1, `expected exit 1; ${describe(result)}`);
      assert.ok(result.stderr.includes(message), describe(result));
      assert.doesNotMatch(result.stderr, /in use/, describe(result));
      assert.doesNotMatch(result.stdout, /New node owner/, describe(result));
    }
  } finally {
    await runningNode.close();
  }

  const unchanged = await runResetCommand(environment, [
    currentOwner.valueOf(),
  ]);

  assert.equal(unchanged.code, 1, `expected exit 1; ${describe(unchanged)}`);
  assert.ok(
    unchanged.stderr.includes('The node is already owned by this identity.'),
    describe(unchanged),
  );
  assert.deepEqual(await readState(databasePath), before, 'database changed');
}

async function failsWhileTheNodeRuns(
  databasePath: string,
  environment: Record<string, string>,
  newOwner: IdentityId,
): Promise<void> {
  const before = await readState(databasePath);
  const runningNode = new Level(databasePath, { valueEncoding: 'json' });

  await runningNode.open();
  const result = await runResetCommand(environment, [
    newOwner.valueOf(),
  ]).finally(() => runningNode.close());
  const context = describe(result);

  assert.equal(result.timedOut, false, `command hung; ${context}`);
  assert.equal(result.code, 1, `expected exit status 1; ${context}`);
  assert.ok(
    result.stderr.includes(
      `The local database at ${databasePath} is in use by another process, such as a running node.`,
    ),
    context,
  );
  assert.match(
    result.stderr,
    /Stop the node, then run yarn node:reset-owner again\./,
    context,
  );
  assert.doesNotMatch(
    result.stderr,
    /^\s+at /m,
    `stack trace printed; ${context}`,
  );
  assert.doesNotMatch(result.stdout, /New node owner/, context);
  assert.deepEqual(await readState(databasePath), before, 'database changed');
}

async function replacesTheOwnerOfTheStoppedNode(
  databasePath: string,
  environment: Record<string, string>,
  newOwner: IdentityId,
): Promise<void> {
  const before = await readState(databasePath);
  const result = await runResetCommand(environment, [newOwner.valueOf()]);
  const context = describe(result);
  const after = await readState(databasePath);

  assert.equal(result.timedOut, false, `command hung; ${context}`);
  assert.equal(result.code, 0, `expected exit status 0; ${context}`);
  assert.ok(
    result.stdout.includes(
      [
        `New node owner: ${newOwner.valueOf()}`,
        'Cleared:',
        '  - previous node owner',
        '  - registration mode codes (now open)',
        '  - 2 registration codes',
        '  - own block list version 4 (1 identity, 0 nodes)',
      ].join('\n'),
    ),
    context,
  );
  assert.deepEqual(
    after,
    {
      blockList: undefined,
      codes: 0,
      identity: before.identity,
      metadata: {
        ...before.metadata,
        owner: newOwner.valueOf(),
        registrationMode: 'open',
      },
    },
    'expected the new owner and only the owner settings to be cleared',
  );
}

async function main(): Promise<void> {
  if (!existsSync(ENTRY_POINT)) {
    throw new Error(`${ENTRY_POINT} is missing; run yarn build first`);
  }

  const workspace = await mkdtemp(
    path.join(os.tmpdir(), 'pigeon-reset-owner-'),
  );
  const databasePath = path.join(workspace, 'local_storage');
  const environment = {
    IPFS_STORAGE_PATH: path.join(workspace, 'ipfs'),
    PIGEON_LOCAL_DB_PATH: databasePath,
  };

  try {
    const currentOwner = await seedClaimedNode(databasePath);
    const newOwner = await NodeBlockListMother.identityId();

    await refusesWithoutAValidNewOwner(
      databasePath,
      environment,
      currentOwner,
    );
    console.log(
      'PASS node:reset-owner refuses a missing, invalid or unchanged new owner',
    );
    await failsWhileTheNodeRuns(databasePath, environment, newOwner);
    console.log('PASS node:reset-owner refuses to run while the node runs');
    await replacesTheOwnerOfTheStoppedNode(
      databasePath,
      environment,
      newOwner,
    );
    console.log(
      'PASS node:reset-owner installs the new owner and clears the owner settings of a stopped node',
    );
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
