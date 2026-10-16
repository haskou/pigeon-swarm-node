import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { SignedRequestBody } from './IndependentRequestSigner';
import type { NodeRuntime } from './two-real-node-gossipsub';

import {
  credentialOf,
  ed25519Sign,
  ed25519Verify,
  fetchJson,
  generateEd25519,
  publishIdentityWithKeys,
  signingContentOf,
} from './IndependentRequestSigner';
import { teardownAndExit } from './RealTransportTeardown';
import {
  addPrivateNetwork,
  buildNodeRuntime,
  generateNetworkKey,
  startNode,
  stopNode,
} from './two-real-node-gossipsub';

/**
 * Pins the signed HTTP request form (#488) against a real node. The fixture
 * vectors carry fixed timestamps a node refuses as stale, so the script first
 * reproduces every vector byte-for-byte with node:crypto only, then re-signs
 * the same request shapes (JSON POST, body-less GET, raw binary POST) with a
 * fresh timestamp and the fixture key, sends them to real signed endpoints and
 * asserts acceptance, and finally asserts the stale, tampered, wrong-path,
 * wrong-method and replayed variants are refused.
 */

const NODE_PORT = 19240;
const INVALID_SIGNED_REQUEST_CODE = 401020;
const SETTINGS_PATH = '/notification-settings/';
const RESERVE_PATH = '/private-blobs';
const UPLOAD_PATH = '/ipfs/public';

type VectorInput = {
  body?: Record<string, unknown>;
  bodyBase64?: string;
  method: string;
  path: string;
  timestamp: number;
};

type VectorHeaders = {
  'x-identity-id': string;
  'x-signature': string;
  'x-timestamp': string;
};

type SignedRequestVectors = {
  cases: Array<{
    derived: {
      canonicalPayload: Record<string, unknown>;
      signature: string;
      signingContent: string;
    };
    headers: VectorHeaders;
    input: VectorInput;
    name: string;
  }>;
  key: {
    identityId: string;
    privateKeyPem: string;
    publicKeyPem: string;
  };
  rejected: Array<{ headers: VectorHeaders; input: VectorInput; name: string }>;
};

type SignedCall = {
  body?: string | Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
  method: string;
  path: string;
};

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/signed-http-request.json'),
    'utf8',
  ),
) as SignedRequestVectors;
const key = vectors.key;

/** The fixture encodes a raw binary body as bodyBase64; it is hashed as bytes. */
function bodyOf(input: VectorInput): SignedRequestBody {
  return input.bodyBase64 === undefined
    ? input.body
    : Buffer.from(input.bodyBase64, 'base64');
}

function assertVectorsReproduce(): void {
  assert.equal(credentialOf(key.publicKeyPem), key.identityId, 'key id');

  for (const vector of vectors.cases) {
    const { input } = vector;
    const content = signingContentOf(
      input.method,
      input.path,
      input.timestamp,
      bodyOf(input),
    );
    const signature = ed25519Sign(key.privateKeyPem, content);

    assert.equal(content, vector.derived.signingContent, vector.name);
    assert.deepEqual(
      JSON.parse(content.slice(content.indexOf('\n') + 1)),
      vector.derived.canonicalPayload,
      `${vector.name} canonical payload`,
    );
    assert.equal(signature, vector.derived.signature, `${vector.name} sig`);
    assert.deepEqual(
      vector.headers,
      {
        'x-identity-id': key.identityId,
        'x-signature': signature,
        'x-timestamp': String(input.timestamp),
      },
      `${vector.name} headers`,
    );
  }

  for (const rejected of vectors.rejected) {
    const { input } = rejected;
    const content = signingContentOf(
      input.method,
      input.path,
      Number(rejected.headers['x-timestamp']),
      bodyOf(input),
    );

    assert.ok(
      !ed25519Verify(
        key.publicKeyPem,
        content,
        rejected.headers['x-signature'],
      ),
      `${rejected.name}: the signature must not cover the altered request`,
    );
  }
}

/** Raw bytes go out as octet-stream, anything else as JSON; no body sends nothing. */
function wireBodyOf(
  body: SignedRequestBody,
): Pick<SignedCall, 'body' | 'headers'> {
  if (body === undefined) return { headers: {} };

  if (Buffer.isBuffer(body)) {
    return {
      body: new Uint8Array(body),
      headers: { 'content-type': 'application/octet-stream' },
    };
  }

  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  };
}

/**
 * Signs `signed` and sends `sent`, so a test can alter one part of the request
 * after signing. Both default to the same request.
 */
function signedCall(
  signed: {
    body?: SignedRequestBody;
    method: string;
    path: string;
    timestamp?: number;
  },
  sent: { body?: SignedRequestBody; method?: string; path?: string } = {},
): SignedCall {
  const timestamp = signed.timestamp ?? Date.now();
  const wire = wireBodyOf('body' in sent ? sent.body : signed.body);
  const content = signingContentOf(
    signed.method,
    signed.path,
    timestamp,
    signed.body,
  );

  return {
    body: wire.body,
    headers: {
      ...wire.headers,
      'x-identity-id': key.identityId,
      'x-signature': ed25519Sign(key.privateKeyPem, content),
      'x-timestamp': String(timestamp),
    },
    method: sent.method ?? signed.method,
    path: sent.path ?? signed.path,
  };
}

async function expectAccepted(
  node: NodeRuntime,
  label: string,
  call: SignedCall,
  status: number,
): Promise<Record<string, unknown>> {
  const response = await fetchJson(
    node,
    call.method,
    call.path,
    call.headers,
    call.body,
  );

  assert.equal(
    response.status,
    status,
    `${label}: ${JSON.stringify(response)}`,
  );

  return response.data;
}

async function expectRefused(
  node: NodeRuntime,
  label: string,
  call: SignedCall,
): Promise<void> {
  const response = await fetchJson(
    node,
    call.method,
    call.path,
    call.headers,
    call.body,
  );

  assert.equal(response.status, 401, `${label}: ${JSON.stringify(response)}`);
  assert.equal(response.data.code, INVALID_SIGNED_REQUEST_CODE, label);
}

async function exercise(node: NodeRuntime): Promise<void> {
  assertVectorsReproduce();

  process.env.PRIVATE_BLOB_STORAGE_PATH = path.join(
    path.dirname(node.localDbPath),
    'private-blobs',
  );
  await startNode(node);
  await addPrivateNetwork(node, generateNetworkKey());
  await publishIdentityWithKeys(
    node,
    {
      device: generateEd25519(),
      identity: key,
      recovery: generateEd25519(),
    },
    'signed-vector',
  );

  const [jsonVector, getVector, binaryVector] = vectors.cases;
  const reservation = { size: 1024 };
  const bytes = Buffer.from(binaryVector.input.bodyBase64, 'base64');

  await expectAccepted(
    node,
    'fresh body-less GET',
    signedCall({ method: getVector.input.method, path: SETTINGS_PATH }),
    200,
  );

  const reserve = signedCall({
    body: reservation,
    method: jsonVector.input.method,
    path: RESERVE_PATH,
  });
  const reserved = await expectAccepted(node, 'fresh JSON POST', reserve, 201);
  assert.equal(typeof reserved.blobId, 'string', 'reservation blob id');

  const uploaded = await expectAccepted(
    node,
    'fresh raw binary POST',
    signedCall({ body: bytes, method: 'POST', path: UPLOAD_PATH }),
    201,
  );
  assert.equal(uploaded.size, bytes.length, 'uploaded size');

  await expectRefused(
    node,
    'the fixed vector timestamp',
    signedCall({
      method: getVector.input.method,
      path: SETTINGS_PATH,
      timestamp: getVector.input.timestamp,
    }),
  );
  await expectRefused(
    node,
    'a timestamp older than the window',
    signedCall({
      method: 'GET',
      path: SETTINGS_PATH,
      timestamp: Date.now() - 60_000,
    }),
  );
  await expectRefused(
    node,
    'a timestamp beyond the window',
    signedCall({
      method: 'GET',
      path: SETTINGS_PATH,
      timestamp: Date.now() + 60_000,
    }),
  );
  await expectRefused(
    node,
    'a JSON body changed after signing',
    signedCall(
      { body: reservation, method: 'POST', path: RESERVE_PATH },
      { body: { size: 2048 } },
    ),
  );
  await expectRefused(
    node,
    'a binary body changed after signing',
    signedCall(
      { body: bytes, method: 'POST', path: UPLOAD_PATH },
      { body: Buffer.concat([bytes, Buffer.from([0])]) },
    ),
  );
  await expectRefused(
    node,
    'a request sent to another path than signed',
    signedCall(
      { body: reservation, method: 'POST', path: `${RESERVE_PATH}/other` },
      { path: RESERVE_PATH },
    ),
  );
  await expectRefused(
    node,
    'a request sent with another method than signed',
    signedCall(
      { body: reservation, method: 'PUT', path: RESERVE_PATH },
      { method: 'POST' },
    ),
  );
  await expectRefused(node, 'a replayed JSON POST', reserve);
}

async function main(): Promise<void> {
  const node = buildNodeRuntime('signed-http-request', NODE_PORT);

  try {
    await exercise(node);
    console.log('signed http request: passed');
  } catch (error) {
    console.error(
      `signed http request: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }

  await teardownAndExit(
    [{ helia: { stop: () => stopNode(node) }, name: node.name }],
    path.dirname(node.localDbPath),
  );
}

void main();
