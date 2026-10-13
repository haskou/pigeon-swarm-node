import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import assert from 'node:assert/strict';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';

import type { NodeRuntime } from './two-real-node-gossipsub';

import { mineAdmissionNonce } from '../../support/mineAdmissionNonce';
import { NETWORK_ID, request } from './two-real-node-gossipsub';

/**
 * Builds signed-request and signed-record bytes from the documented algorithms
 * with node:crypto only (#488). It never calls the node's canonicalization or
 * signing code, so a drift in the node shows up as a rejection by a real node
 * instead of being signed the same wrong way on both sides.
 */

export type SignedRequestBody = Buffer | Record<string, unknown> | undefined;

export type Ed25519Fixture = {
  privateKeyPem: string;
  publicKeyPem: string;
};

/** Lowercase hex SHA-256 of raw bytes, otherwise of utf8(JSON.stringify(body || {})). */
export function bodyHashOf(body: SignedRequestBody): string {
  const bytes = Buffer.isBuffer(body)
    ? body
    : Buffer.from(JSON.stringify(body || {}), 'utf8');

  return createHash('sha256').update(bytes).digest('hex');
}

/** JSON.stringify of bodyHash, method (upper-cased), path, timestamp (a JSON number), in this order. */
export function signingContentOf(
  method: string,
  requestPath: string,
  timestamp: number,
  body: SignedRequestBody,
): string {
  return JSON.stringify({
    bodyHash: bodyHashOf(body),
    method: method.toUpperCase(),
    path: requestPath,
    timestamp,
  });
}

/** Ed25519 over utf8(content), standard base64 with padding. */
export function ed25519Sign(privateKeyPem: string, content: string): string {
  return sign(
    null,
    Buffer.from(content, 'utf8'),
    createPrivateKey(privateKeyPem),
  ).toString('base64');
}

export function ed25519Verify(
  publicKeyPem: string,
  content: string,
  signature: string,
): boolean {
  return verify(
    null,
    Buffer.from(content, 'utf8'),
    createPublicKey(publicKeyPem),
    Buffer.from(signature, 'base64'),
  );
}

/** Body-only base64 SPKI: the PEM BEGIN/END lines and all whitespace removed. */
export function credentialOf(publicKeyPem: string): string {
  return publicKeyPem
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
}

export function generateEd25519(): Ed25519Fixture {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
}

export function flipFirstSignatureByte(signature: string): string {
  const bytes = Buffer.from(signature, 'base64');

  bytes.set([(bytes[0] + 1) % 256], 0);

  return bytes.toString('base64');
}

export async function fetchJson(
  node: NodeRuntime,
  method: string,
  requestPath: string,
  headers: Record<string, string>,
  body?: string | Uint8Array<ArrayBuffer>,
): Promise<{ data: Record<string, unknown>; status: number }> {
  const response = await fetch(`${node.baseUrl}${requestPath}`, {
    body,
    headers: { Connection: 'close', ...headers },
    method,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();

  return {
    data: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    status: response.status,
  };
}

/**
 * Publishes an identity whose identity, device and recovery keys are given, so
 * a fixture key can sign real requests. The admission nonce and the device
 * credential commitment are setup, not the signed payloads under test.
 */
export async function publishIdentityWithKeys(
  node: NodeRuntime,
  keys: {
    device: Ed25519Fixture;
    identity: Ed25519Fixture;
    recovery: Ed25519Fixture;
  },
  handle: string,
): Promise<{ authorizationRevision: number; id: string }> {
  const id = credentialOf(keys.identity.publicKeyPem);
  const deviceCredential = DeviceCredential.fromString(
    keys.device.publicKeyPem,
  );
  const signaturePayload = {
    admissionNonce: mineAdmissionNonce(id, [NETWORK_ID]),
    authorizationRevision: 0,
    deviceCredential: deviceCredential.valueOf(),
    deviceCredentialCommitment: deviceCredential.getCommitment().valueOf(),
    id,
    networks: [NETWORK_ID],
    previousIdentityExternalIdentifier: undefined as string | undefined,
    profile: {
      banner: undefined as string | undefined,
      biography: undefined as string | undefined,
      handle,
      name: handle,
      picture: undefined as string | undefined,
    },
    recoveryAuthority: keys.recovery.publicKeyPem,
    timestamp: Date.now(),
    version: 1,
  };
  const response = await request<{
    authorizationRevision: number;
    id: string;
  }>(node, 'POST', '/identities/', {
    ...signaturePayload,
    signature: ed25519Sign(
      keys.identity.privateKeyPem,
      JSON.stringify(signaturePayload),
    ),
  });

  assert.equal(response.id, id, 'published identity id differs');

  return response;
}
