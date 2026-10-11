import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Runs the `final` image as a container and drives a private blob through it:
 * signed reserve, streamed upload, download, range read and withdrawal. It
 * proves the image runs as a non-root user that can write `./private_blobs`,
 * and that blob bytes and capabilities never reach the container logs.
 *
 * Set PIGEON_CONTAINER_IMAGE to test an already-built image; otherwise the
 * image is built from the repository root.
 */

const execFileAsync = promisify(execFile);
const IMAGE =
  process.env.PIGEON_CONTAINER_IMAGE ?? 'pigeon-swarm-node:private-blob-smoke';
const CONTAINER = `pigeon-private-blob-smoke-${process.pid}`;
const READY_TIMEOUT_MS = 90_000;
const SIGNED_PATH = '/private-blobs';
const DATA_DIRECTORY = '/var/www/private_blobs';

type Reservation = {
  blobId: string;
  downloadToken: string;
  uploadToken: string;
};

function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, milliseconds);

  return promise;
}

async function docker(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, {
    maxBuffer: 16 * 1024 * 1024,
  });

  return stdout.trim();
}

function buildImage(): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  const build = spawn(
    'docker',
    ['build', '--target', 'final', '-t', IMAGE, '.'],
    { stdio: 'inherit' },
  );

  build.on('error', reject);
  build.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`docker build exited with ${code}`));
    }
  });

  return promise;
}

async function startContainer(): Promise<string> {
  await docker([
    'run',
    '--detach',
    '--name',
    CONTAINER,
    '--env',
    'API_PORT=80',
    '--env',
    'CONTAINER_BUILD=false',
    '--env',
    'TRANSPORT_DSN=in-memory://',
    '--publish',
    '127.0.0.1::80',
    IMAGE,
  ]);

  const mapping = (await docker(['port', CONTAINER, '80'])).split('\n')[0];
  const port = /:(\d+)$/.exec(mapping)?.[1];

  assert.ok(port, `unexpected port mapping: ${mapping}`);

  return `http://127.0.0.1:${port}`;
}

async function waitForApi(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/`)).ok) {
        return;
      }
    } catch {
      // The container is still booting.
    }

    await delay(1_000);
  }

  throw new Error(`API did not answer within ${READY_TIMEOUT_MS} ms`);
}

function signedHeaders(
  keyPair: KeyPair,
  method: string,
  requestPath: string,
  body: unknown,
): Record<string, string> {
  const timestamp = String(Date.now());
  const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
    method,
    requestPath,
    timestamp,
    body,
  );

  return {
    'content-type': 'application/json',
    'x-identity-id': new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
    'x-signature': keyPair.sign(JSON.stringify(payload)).valueOf(),
    'x-timestamp': timestamp,
  };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function exerciseBlob(baseUrl: string): Promise<string> {
  const uid = await docker(['exec', CONTAINER, 'id', '-u']);

  assert.notEqual(uid, '0', 'the container must not run as root');

  const keyPair = await KeyPair.generate();
  const plaintext = randomBytes(32).toString('hex');
  const payload = Buffer.from(plaintext);
  const reservationBody = { size: payload.length };
  const reserved = await fetch(`${baseUrl}${SIGNED_PATH}`, {
    body: JSON.stringify(reservationBody),
    headers: signedHeaders(keyPair, 'POST', SIGNED_PATH, reservationBody),
    method: 'POST',
  });

  assert.equal(reserved.status, 201, `reserve returned ${reserved.status}`);

  const { blobId, downloadToken, uploadToken } =
    (await reserved.json()) as Reservation;
  const blobPath = `${SIGNED_PATH}/${blobId}`;

  const uploaded = await fetch(`${baseUrl}${blobPath}`, {
    body: payload,
    headers: bearer(uploadToken),
    method: 'PUT',
  });

  assert.equal(uploaded.status, 204, `upload returned ${uploaded.status}`);

  const downloaded = await fetch(`${baseUrl}${blobPath}`, {
    headers: bearer(downloadToken),
  });

  assert.equal(
    downloaded.status,
    200,
    `download returned ${downloaded.status}`,
  );
  assert.equal(downloaded.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), payload);

  const ranged = await fetch(`${baseUrl}${blobPath}`, {
    headers: { ...bearer(downloadToken), range: 'bytes=2-4' },
  });

  assert.equal(ranged.status, 206, `range read returned ${ranged.status}`);
  assert.equal(await ranged.text(), plaintext.slice(2, 5));

  const anonymous = await fetch(`${baseUrl}${blobPath}`);

  assert.equal(anonymous.status, 404, 'a missing capability must look unknown');

  const storedMode = await docker([
    'exec',
    CONTAINER,
    'stat',
    '-c',
    '%U %a',
    `${DATA_DIRECTORY}/${blobId}.blob`,
  ]);

  assert.equal(storedMode, 'node 600', 'stored blob must be owned by node');

  const directoryMode = await docker([
    'exec',
    CONTAINER,
    'stat',
    '-c',
    '%U %a',
    DATA_DIRECTORY,
  ]);

  assert.equal(directoryMode, 'node 700', 'blob folder must be node-owned');

  const withdrawn = await fetch(`${baseUrl}${blobPath}`, {
    headers: bearer(uploadToken),
    method: 'DELETE',
  });

  assert.equal(withdrawn.status, 204, `delete returned ${withdrawn.status}`);

  const gone = await fetch(`${baseUrl}${blobPath}`, {
    headers: bearer(downloadToken),
  });

  assert.equal(gone.status, 404, 'a withdrawn blob must be unknown');

  const logs = await docker(['logs', CONTAINER]);

  for (const secret of [plaintext, uploadToken, downloadToken]) {
    assert.ok(
      !logs.includes(secret),
      'container logs must not contain secrets',
    );
  }

  return uid;
}

async function containerLogs(): Promise<string> {
  return docker(['logs', '--tail', '200', CONTAINER]).catch(
    () => '(no container logs)',
  );
}

async function main(): Promise<void> {
  if (!process.env.PIGEON_CONTAINER_IMAGE) {
    await buildImage();
  }

  try {
    const baseUrl = await startContainer();

    await waitForApi(baseUrl);

    const uid = await exerciseBlob(baseUrl);

    console.log(
      `Private blob container smoke passed as uid ${uid} on ${IMAGE}.`,
    );
  } catch (error: unknown) {
    console.error(error);
    console.error(`Container logs:\n${await containerLogs()}`);
    process.exitCode = 1;
  } finally {
    await docker(['rm', '--force', CONTAINER]).catch(() => undefined);
  }
}

void main();
