import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import PrivateFreshnessVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateFreshnessVerifier';
import InMemoryPrivateFreshnessGate from '@app/contexts/private-authorization/infrastructure/freshness/InMemoryPrivateFreshnessGate';
import LegacyIdentityDeviceBinding from '@app/contexts/private-authorization/infrastructure/crypto/LegacyIdentityDeviceBinding';
import { PrivateFreshnessProof, PrivateKey } from '@haskou/pigeon-swarm-crypto';

describe('InMemoryPrivateFreshnessGate', () => {
  const scopeId = Buffer.alloc(32, 1).toString('base64url');
  const headHash = Buffer.alloc(32, 2).toString('base64url');
  const digest = Buffer.alloc(32, 3).toString('base64url');
  const nonce = Buffer.alloc(32, 4).toString('base64url');
  const privateKey = PrivateKey.generate();
  const publicSpki = privateKey
    .getPublicKey()
    .toString()
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  const deviceKey = new LegacyIdentityDeviceBinding().bind(publicSpki);
  const checkpoint = PrivateAuthorizationCheckpoint.genesis({
    admittedDeviceKeys: [deviceKey],
    authorityKeys: [deviceKey],
    controlCheckpointJson: '{}',
    freshnessAuthorityKey: deviceKey,
    headHash,
    scopeId,
  });
  const operation = PrivateControlOperation.fromPrimitives({
    authorDeviceKey: deviceKey,
    authorizationRevision: 0,
    byteSize: 1,
    digest,
    id: Buffer.alloc(16, 5).toString('base64url'),
    kind: 'membership.propose',
    mutation: { targetIdentityId: publicSpki, type: 'member.remove' },
    previousOperationIds: [],
    scopeId,
  });
  let now: number;
  let gate: InMemoryPrivateFreshnessGate;

  beforeEach(() => {
    now = 100;
    gate = new InMemoryPrivateFreshnessGate(
      new PrivateFreshnessVerifier(),
      () => now,
      () => nonce,
    );
  });

  const signedProof = (requestJson: string) => {
    const request = JSON.parse(requestJson);

    return PrivateFreshnessProof.sign(
      JSON.stringify({
        batchCommitment: request.batchCommitment,
        headHash: request.expectedHeadHash,
        nonce: request.nonce,
        revision: request.expectedRevision,
        scopeId: request.scopeId,
        signerKey: deviceKey,
        version: 1,
      }),
      privateKey,
    );
  };

  it('accepts one exact proof within the monotonic ten-second window', async () => {
    const request = gate.issue(checkpoint, operation);

    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).resolves.toEqual({ replayMarkerId: nonce });
    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('rejects and consumes an expired challenge', async () => {
    const request = gate.issue(checkpoint, operation);
    now += 10_001;

    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('bounds outstanding challenges and releases expired capacity', () => {
    for (let index = 0; index < 1024; index++) {
      gate.issue(
        checkpoint,
        PrivateControlOperation.fromPrimitives({
          ...operation.toPrimitives(),
          digest: Buffer.alloc(32, 0).fill(index % 256, 0, 1).fill(index >> 8, 1, 2).toString('base64url'),
        }),
      );
    }
    const overflow = PrivateControlOperation.fromPrimitives({
      ...operation.toPrimitives(),
      digest: Buffer.alloc(32, 9).toString('base64url'),
    });

    expect(() => gate.issue(checkpoint, overflow)).toThrow(
      'Invalid private authorization',
    );
    now += 10_001;
    expect(() => gate.issue(checkpoint, overflow)).not.toThrow();
  });
});
