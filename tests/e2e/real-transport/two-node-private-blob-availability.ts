import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  KeyPair,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import net, { AddressInfo } from 'node:net';
import path from 'node:path';

import { teardownAndExit } from './RealTransportTeardown';

/**
 * Two real nodes hold identical private-blob ciphertext, each under its own
 * reservation, as docs/design/private-blob-store.md ("Availability across
 * nodes") prescribes. Stopping the home node must leave the bytes readable from
 * the other node with that node's capability, and the home origin unreachable.
 */

type Reservation = {
  blobId: string;
  downloadToken: string;
  uploadToken: string;
};

type Replica = {
  child: ChildProcessWithoutNullStreams;
  name: string;
  origin: string;
  stderr: string[];
  stdout: string[];
};

const ROOT = path.resolve(
  process.env.PIGEON_TEST_SOURCE_ROOT || path.resolve(__dirname, '../../..'),
);
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-node-private-blob-availability');
const NODE_ARGS = [
  '-r',
  'ts-node/register',
  '-r',
  'tsconfig-paths/register',
  path.join(ROOT, 'src/index.ts'),
];
const SIGNED_PATH = '/private-blobs';
const WAIT_TIMEOUT_MS = 90_000;

const replicas: Replica[] = [];
let stage = 'setup';

function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, milliseconds);

  return promise;
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  const listening = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();

  server.listen(0, '127.0.0.1', listening.resolve);
  await listening.promise;

  const { port } = server.address() as AddressInfo;

  server.close(() => closed.resolve());
  await closed.promise;

  return port;
}

function signedHeaders(
  keyPair: KeyPair,
  method: string,
  requestPath: string,
  body: unknown,
): Record<string, string> {
  const timestamp = String(Date.now());
  const payload = SignedHttpRequestSignature.signingContent({
    body: body as SignedHttpRequestBody,
    method,
    path: requestPath,
    timestamp: Number(timestamp),
  });

  return {
    'content-type': 'application/json',
    'x-identity-id': new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
    'x-signature': keyPair.sign(payload).valueOf(),
    'x-timestamp': timestamp,
  };
}

async function startReplica(name: string): Promise<Replica> {
  const port = await freePort();
  const directory = path.join(TMP_ROOT, name);

  await mkdir(directory, { recursive: true });

  const child = spawn(process.execPath, NODE_ARGS, {
    cwd: ROOT,
    env: {
      ...process.env,
      API_PORT: String(port),
      IPFS_STORAGE_PATH: path.join(directory, 'ipfs'),
      NODE_ENV: 'local',
      PIGEON_LOCAL_DB_PATH: path.join(directory, 'local-db'),
      PRIVATE_BLOB_STORAGE_PATH: path.join(directory, 'private_blobs'),
      ROUTE_PREFIX: '',
      TRANSPORT_DSN: 'in-memory://',
    },
  });
  const replica: Replica = {
    child,
    name,
    origin: `http://127.0.0.1:${port}`,
    stderr: [],
    stdout: [],
  };

  replicas.push(replica);
  child.stdout.on('data', (data: Buffer) => {
    replica.stdout.push(data.toString());
  });
  child.stderr.on('data', (data: Buffer) => {
    replica.stderr.push(data.toString());
  });

  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (!replica.stdout.join('').includes('Ready!')) {
    if (child.exitCode !== null || Date.now() > deadline) {
      throw new Error(
        `${name} did not become ready:\n${replica.stderr.slice(-20).join('')}`,
      );
    }

    await delay(200);
  }

  return replica;
}

async function stopReplica(replica: Replica): Promise<void> {
  const { child } = replica;

  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = Promise.withResolvers<void>();
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);

  child.once('exit', () => {
    clearTimeout(timer);
    exited.resolve();
  });
  child.kill('SIGTERM');

  await exited.promise;
}

async function storeBlob(
  replica: Replica,
  keyPair: KeyPair,
  ciphertext: Buffer,
): Promise<Reservation> {
  const reservationBody = { size: ciphertext.length };
  const reserved = await fetch(`${replica.origin}${SIGNED_PATH}`, {
    body: JSON.stringify(reservationBody),
    headers: signedHeaders(keyPair, 'POST', SIGNED_PATH, reservationBody),
    method: 'POST',
  });

  assert.equal(
    reserved.status,
    201,
    `${replica.name} reserve returned ${reserved.status}`,
  );

  const reservation = (await reserved.json()) as Reservation;
  const uploaded = await fetch(
    `${replica.origin}${SIGNED_PATH}/${reservation.blobId}`,
    {
      body: new Uint8Array(ciphertext),
      headers: { authorization: `Bearer ${reservation.uploadToken}` },
      method: 'PUT',
    },
  );

  assert.equal(
    uploaded.status,
    204,
    `${replica.name} upload returned ${uploaded.status}`,
  );

  return reservation;
}

async function main(): Promise<void> {
  stage = 'start both replicas';
  await rm(TMP_ROOT, { force: true, recursive: true });

  const home = await startReplica('home');
  const other = await startReplica('other');
  const keyPair = await KeyPair.generate();
  const ciphertext = randomBytes(256);

  stage = 'store identical ciphertext on both replicas';
  const homeReservation = await storeBlob(home, keyPair, ciphertext);
  const otherReservation = await storeBlob(other, keyPair, ciphertext);

  assert.notEqual(
    homeReservation.blobId,
    otherReservation.blobId,
    'each node issues its own blob id',
  );

  stage = 'stop the home replica';
  await stopReplica(home);

  stage = 'home origin is unreachable';
  await assert.rejects(
    fetch(`${home.origin}${SIGNED_PATH}/${homeReservation.blobId}`, {
      headers: { authorization: `Bearer ${homeReservation.downloadToken}` },
    }),
  );

  stage = 'other replica still serves the identical bytes';
  const read = await fetch(
    `${other.origin}${SIGNED_PATH}/${otherReservation.blobId}`,
    { headers: { authorization: `Bearer ${otherReservation.downloadToken}` } },
  );

  assert.equal(read.status, 200, `other download returned ${read.status}`);
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), ciphertext);

  console.info(
    JSON.stringify(
      { ciphertextBytes: ciphertext.length, replicas: 2, result: 'PASS' },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      `Two-node private blob availability failed at "${stage}": ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() =>
    teardownAndExit(
      replicas.map((replica) => ({
        helia: { stop: () => stopReplica(replica) },
        name: replica.name,
      })),
      TMP_ROOT,
    ),
  );
