import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { NodeRuntime } from './two-real-node-gossipsub';

import {
  credentialOf,
  ed25519Sign,
  ed25519Verify,
  fetchJson,
  flipFirstSignatureByte,
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
  waitFor,
} from './two-real-node-gossipsub';

/**
 * Pins the device sealed-secret entry signature (#488) against a real node:
 * the preimage and signatures are rebuilt from
 * @haskou/pigeon-swarm-crypto/vectors/device-sealed-secret.json with node:crypto only, the
 * vector bundle is accepted over HTTP, and the fixture's rejected bundles plus a
 * flipped signature byte are refused. Sealed secrets are node-local storage
 * (docs/design/device-sealed-secrets.md), so there is no second node to assert.
 */

const NODE_PORT = 19230;
const PURPOSE = 'pigeon:device-sealed-secret:v1';
const PKCS8_ED25519_PREFIX = '302e020100300506032b657004220420';
const INVALID_SIGNATURE_CODE = 'InvalidDeviceSealedSecretSignatureError';

type Role = 'candidate' | 'identity' | 'owner' | 'recovery';

type VectorKey = {
  identityId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  seedDerivation: string;
  seedHex: string;
};

type SealedEntry = {
  recipientCredential: string;
  sealedSecret: string;
  signature: string;
};

type BundlePrimitives = {
  authorizationRevision: number;
  entries: SealedEntry[];
  generation: number;
  identityId: string;
  publisherCredential: string;
};

type PreimageInput = {
  authorizationRevision: number;
  generation: number;
  identityId: string;
  publisherCredential: string;
  recipientCredential: string;
  sealedSecret: string;
};

type SealedSecretVectors = {
  bundle: {
    accepted: { normalized: BundlePrimitives; primitives: BundlePrimitives };
    rejected: Array<{
      name: string;
      primitives: BundlePrimitives;
      signedPayload: string;
    }>;
  };
  cases: Array<{
    derived: { signature: string; signingPayload: string };
    input: PreimageInput;
    name: string;
    signer: Role;
  }>;
  keys: Record<Role, VectorKey>;
  normalization: Array<{ input: string; name: string; normalized: string }>;
};

type PutBody = Pick<
  BundlePrimitives,
  'authorizationRevision' | 'entries' | 'generation'
>;

type SignedCall = {
  body?: string;
  headers: Record<string, string>;
  method: 'GET' | 'PUT';
};

const vectors = JSON.parse(
  readFileSync(
    require.resolve('@haskou/pigeon-swarm-crypto/vectors/device-sealed-secret.json'),
    'utf8',
  ),
) as SealedSecretVectors;
const owner = vectors.keys.owner;
const identityId = vectors.keys.identity.identityId;
const sealedSecretsPath = `/identity-devices/${encodeURIComponent(identityId)}/sealed-secrets`;

/** JSON.stringify of the seven preimage keys in their documented order. */
function preimageOf(input: PreimageInput): string {
  return JSON.stringify({
    authorizationRevision: input.authorizationRevision,
    generation: input.generation,
    identityId: credentialOf(input.identityId),
    publisherCredential: credentialOf(input.publisherCredential),
    purpose: PURPOSE,
    recipientCredential: credentialOf(input.recipientCredential),
    sealedSecret: input.sealedSecret,
  });
}

function assertKeyDerivation(role: Role, key: VectorKey): void {
  const seed = createHash('sha256')
    .update(`pigeon-vector:device-sealed-secret:${role}`, 'utf8')
    .digest('hex');
  const privateKey = createPrivateKey(key.privateKeyPem);
  const publicKeyPem = createPublicKey(privateKey)
    .export({ format: 'pem', type: 'spki' })
    .toString();

  assert.equal(seed, key.seedHex, `${role} seed`);
  assert.equal(
    privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex'),
    `${PKCS8_ED25519_PREFIX}${seed}`,
    `${role} PKCS#8`,
  );
  assert.equal(publicKeyPem, key.publicKeyPem, `${role} public key`);
  assert.equal(credentialOf(key.publicKeyPem), key.identityId, `${role} id`);
}

function assertVectorsReproduce(): void {
  for (const [role, key] of Object.entries(vectors.keys)) {
    assertKeyDerivation(role as Role, key);
  }

  for (const normalization of vectors.normalization) {
    assert.equal(
      credentialOf(normalization.input),
      normalization.normalized,
      `normalization: ${normalization.name}`,
    );
  }

  for (const vector of vectors.cases) {
    const preimage = preimageOf(vector.input);

    assert.equal(preimage, vector.derived.signingPayload, vector.name);
    assert.equal(
      ed25519Sign(vectors.keys[vector.signer].privateKeyPem, preimage),
      vector.derived.signature,
      `${vector.name} signature`,
    );
  }

  for (const rejected of vectors.bundle.rejected) {
    const [entry] = rejected.primitives.entries;
    const canonical = preimageOf({ ...rejected.primitives, ...entry });

    assert.ok(
      ed25519Verify(
        owner.publicKeyPem,
        rejected.signedPayload,
        entry.signature,
      ),
      `${rejected.name}: fixture signature must sign its stated payload`,
    );
    assert.ok(
      !ed25519Verify(owner.publicKeyPem, canonical, entry.signature),
      `${rejected.name}: fixture signature must not sign the canonical preimage`,
    );
  }
}

/** Device-proof headers over the independently built signed-request payload. */
function signedCall(
  method: 'GET' | 'PUT',
  body?: PutBody,
  timestamp = Date.now(),
): SignedCall {
  const content = signingContentOf(method, sealedSecretsPath, timestamp, body);

  return {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      'x-device-credential': owner.identityId,
      'x-device-signature': ed25519Sign(owner.privateKeyPem, content),
      'x-timestamp': String(timestamp),
    },
    method,
  };
}

function send(
  node: NodeRuntime,
  call: SignedCall,
): Promise<{ data: Record<string, unknown>; status: number }> {
  return fetchJson(
    node,
    call.method,
    sealedSecretsPath,
    call.headers,
    call.body,
  );
}

function putBodyOf(primitives: BundlePrimitives): PutBody {
  return {
    authorizationRevision: primitives.authorizationRevision,
    entries: primitives.entries,
    generation: primitives.generation,
  };
}

function freshOwnerEntry(
  authorizationRevision: number,
  generation: number,
  sealedSecret: string,
): SealedEntry {
  return {
    recipientCredential: owner.identityId,
    sealedSecret,
    signature: ed25519Sign(
      owner.privateKeyPem,
      preimageOf({
        authorizationRevision,
        generation,
        identityId,
        publisherCredential: owner.identityId,
        recipientCredential: owner.identityId,
        sealedSecret,
      }),
    ),
  };
}

async function expectRejected(
  node: NodeRuntime,
  label: string,
  body: PutBody,
  status: number,
  code: number | string,
): Promise<void> {
  const response = await send(node, signedCall('PUT', body));

  assert.equal(
    response.status,
    status,
    `${label}: ${JSON.stringify(response)}`,
  );
  assert.equal(response.data.code, code, `${label}: code`);
}

async function exercise(node: NodeRuntime): Promise<void> {
  assertVectorsReproduce();

  await startNode(node);
  await addPrivateNetwork(node, generateNetworkKey());

  const identity = await publishIdentityWithKeys(
    node,
    {
      device: owner,
      identity: vectors.keys.identity,
      recovery: vectors.keys.recovery,
    },
    'sealed-vector',
  );

  assert.equal(identity.authorizationRevision, 0);
  await waitFor(async () => {
    const response = await send(node, signedCall('GET'));

    return response.status === 404 && response.data.code === 404030;
  }, 'the vector identity device authorization with no sealed secret yet');

  const stale = await send(
    node,
    signedCall('GET', undefined, Date.now() - 60_000),
  );
  assert.equal(stale.status, 401, 'stale device proof');
  assert.equal(stale.data.code, 401020, 'stale device proof code');

  for (const rejected of vectors.bundle.rejected) {
    await expectRejected(
      node,
      rejected.name,
      putBodyOf(rejected.primitives),
      409,
      INVALID_SIGNATURE_CODE,
    );
  }

  const accepted = vectors.bundle.accepted;
  const [acceptedEntry] = accepted.primitives.entries;
  await expectRejected(
    node,
    'one flipped signature byte',
    {
      ...putBodyOf(accepted.primitives),
      entries: [
        {
          ...acceptedEntry,
          signature: flipFirstSignatureByte(acceptedEntry.signature),
        },
      ],
    },
    409,
    INVALID_SIGNATURE_CODE,
  );

  const publish = signedCall('PUT', putBodyOf(accepted.primitives));
  const published = await send(node, publish);
  assert.equal(published.status, 200, JSON.stringify(published));
  assert.deepEqual(published.data, {
    authorizationRevision: 0,
    generation: 1,
    identityId,
  });

  const [vector] = vectors.cases;
  const [normalizedEntry] = accepted.normalized.entries;
  const delivery = await send(node, signedCall('GET'));
  assert.equal(delivery.status, 200, JSON.stringify(delivery));
  assert.deepEqual(delivery.data, {
    authorizationRevision: vector.input.authorizationRevision,
    generation: vector.input.generation,
    identityId: accepted.normalized.identityId,
    publisherCredential: accepted.normalized.publisherCredential,
    recipientCredential: normalizedEntry.recipientCredential,
    sealedSecret: normalizedEntry.sealedSecret,
    signature: vector.derived.signature,
  });

  const replay = await send(node, publish);
  assert.equal(replay.status, 401, 'replayed device proof');

  await expectRejected(
    node,
    'vector generation republished',
    {
      authorizationRevision: vector.input.authorizationRevision,
      entries: [
        {
          recipientCredential: vector.input.recipientCredential,
          sealedSecret: vector.input.sealedSecret,
          signature: vector.derived.signature,
        },
      ],
      generation: vector.input.generation,
    },
    409,
    'DeviceSealedSecretGenerationStaleError',
  );

  const nextSecret = 'v2.x25519-hkdf-sha256-aes-256-gcm.bmV4dA.aXY.Y3Q.dGFn';
  await expectRejected(
    node,
    'entry signed for a revision the identity is not at',
    {
      authorizationRevision: 1,
      entries: [freshOwnerEntry(1, 2, nextSecret)],
      generation: 2,
    },
    409,
    'DeviceSealedSecretRevisionMismatchError',
  );

  const nextEntry = freshOwnerEntry(0, 2, nextSecret);
  const rotated = await send(
    node,
    signedCall('PUT', {
      authorizationRevision: 0,
      entries: [nextEntry],
      generation: 2,
    }),
  );
  assert.equal(rotated.status, 200, JSON.stringify(rotated));

  const rotatedDelivery = await send(node, signedCall('GET'));
  assert.equal(rotatedDelivery.status, 200, JSON.stringify(rotatedDelivery));
  assert.equal(rotatedDelivery.data.generation, 2);
  assert.equal(rotatedDelivery.data.sealedSecret, nextSecret);
  assert.equal(rotatedDelivery.data.signature, nextEntry.signature);
}

async function main(): Promise<void> {
  const node = buildNodeRuntime('device-sealed-secret-bundle', NODE_PORT);

  try {
    await exercise(node);
    console.log('device sealed secret bundle: passed');
  } catch (error) {
    console.error(
      `device sealed secret bundle: failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }

  await teardownAndExit(
    [{ helia: { stop: () => stopNode(node) }, name: node.name }],
    path.dirname(node.localDbPath),
  );
}

void main();
