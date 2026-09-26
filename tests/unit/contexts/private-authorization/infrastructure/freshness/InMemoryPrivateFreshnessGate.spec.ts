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

  afterEach(async () => {
    now += 10_001;
    const request = gate.issue(checkpoint, operation);
    await gate.verify(checkpoint, operation, signedProof(request));
  });

  it('accepts one exact proof within the monotonic ten-second window', async () => {
    const request = gate.issue(checkpoint, operation);

    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).resolves.toEqual({ replayMarkerId: nonce });
    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('rejects an expired challenge', async () => {
    const request = gate.issue(checkpoint, operation);
    now += 10_001;

    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('does not extend a challenge lifetime when the same operation is reissued', async () => {
    const request = gate.issue(checkpoint, operation);
    now += 9_000;

    expect(gate.issue(checkpoint, operation)).toBe(request);
    now += 1_001;
    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('rebinds a repeated operation to the current checkpoint', async () => {
    const request = gate.issue(checkpoint, operation);
    const advanced = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint.toPrimitives(),
      headHash: Buffer.alloc(32, 8).toString('base64url'),
      parentHeadHash: headHash,
      revision: 1,
    });
    const rebound = gate.issue(advanced, operation);

    expect(rebound).not.toBe(request);
    await expect(
      gate.verify(advanced, operation, signedProof(request)),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('rejects authors outside the current admitted policy', () => {
    const unknown = PrivateControlOperation.fromPrimitives({
      ...operation.toPrimitives(),
      authorDeviceKey: new LegacyIdentityDeviceBinding().bind(
        PrivateKey.generate()
          .getPublicKey()
          .toString()
          .replace(
            /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
            '',
          ),
      ),
    });

    expect(() => gate.issue(checkpoint, unknown)).toThrow(
      'Invalid private authorization',
    );
  });

  it('keeps a challenge available after an invalid proof attempt', async () => {
    const request = gate.issue(checkpoint, operation);

    await expect(
      gate.verify(checkpoint, operation, '{}'),
    ).rejects.toThrow();
    await expect(
      gate.verify(checkpoint, operation, signedProof(request)),
    ).resolves.toEqual({ replayMarkerId: nonce });
  });

  it('allows only one concurrent verification of a challenge', async () => {
    const request = gate.issue(checkpoint, operation);
    const proof = signedProof(request);
    const results = await Promise.allSettled([
      gate.verify(checkpoint, operation, proof),
      gate.verify(checkpoint, operation, proof),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('isolates challenges between gate instances in one process', async () => {
    const firstNonce = Buffer.alloc(32, 11).toString('base64url');
    const secondNonce = Buffer.alloc(32, 12).toString('base64url');
    const first = new InMemoryPrivateFreshnessGate(
      new PrivateFreshnessVerifier(),
      () => now,
      () => firstNonce,
    );
    const second = new InMemoryPrivateFreshnessGate(
      new PrivateFreshnessVerifier(),
      () => now,
      () => secondNonce,
    );
    const firstRequest = first.issue(checkpoint, operation);
    const secondRequest = second.issue(checkpoint, operation);

    expect(firstRequest).not.toBe(secondRequest);
    await expect(
      first.verify(checkpoint, operation, signedProof(firstRequest)),
    ).resolves.toEqual({ replayMarkerId: firstNonce });
    await expect(
      second.verify(checkpoint, operation, signedProof(secondRequest)),
    ).resolves.toEqual({ replayMarkerId: secondNonce });
  });

  it('bounds outstanding challenges per scope and author', () => {
    for (let index = 0; index < 64; index++) {
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
    const alternateKey = new LegacyIdentityDeviceBinding().bind(
      PrivateKey.generate()
        .getPublicKey()
        .toString()
        .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, ''),
    );
    const alternateAuthor = PrivateControlOperation.fromPrimitives({
      ...overflow.toPrimitives(),
      authorDeviceKey: alternateKey,
    });
    const sharedScope = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint.toPrimitives(),
      admittedDeviceKeys: [deviceKey, alternateKey],
    });
    expect(() => gate.issue(sharedScope, alternateAuthor)).not.toThrow();
    const alternateScopeId = Buffer.alloc(32, 7).toString('base64url');
    const alternateScope = PrivateAuthorizationCheckpoint.genesis({
      ...checkpoint.toPrimitives(),
      scopeId: alternateScopeId,
    });
    const alternateScopeOperation = PrivateControlOperation.fromPrimitives({
      ...overflow.toPrimitives(),
      scopeId: alternateScopeId,
    });
    expect(() =>
      gate.issue(alternateScope, alternateScopeOperation),
    ).not.toThrow();

    now += 10_001;
    expect(() => gate.issue(checkpoint, overflow)).not.toThrow();
  });

  it('bounds each scope without denying challenges in another scope', () => {
    const authorKeys = Array.from({ length: 17 }, () =>
      new LegacyIdentityDeviceBinding().bind(
        PrivateKey.generate()
          .getPublicKey()
          .toString()
          .replace(
            /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
            '',
          ),
      ),
    );
    const crowdedScope = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint.toPrimitives(),
      admittedDeviceKeys: [deviceKey, ...authorKeys],
    });

    for (let authorIndex = 0; authorIndex < 16; authorIndex++) {
      for (let challengeIndex = 0; challengeIndex < 64; challengeIndex++) {
        const challengeDigest = Buffer.alloc(32);
        challengeDigest.writeUInt16BE(authorIndex, 0);
        challengeDigest.writeUInt16BE(challengeIndex, 2);
        gate.issue(
          crowdedScope,
          PrivateControlOperation.fromPrimitives({
            ...operation.toPrimitives(),
            authorDeviceKey: authorKeys[authorIndex],
            digest: challengeDigest.toString('base64url'),
          }),
        );
      }
    }
    const overflow = PrivateControlOperation.fromPrimitives({
      ...operation.toPrimitives(),
      authorDeviceKey: authorKeys[16],
      digest: Buffer.alloc(32, 9).toString('base64url'),
    });

    expect(() => gate.issue(crowdedScope, overflow)).toThrow(
      'Invalid private authorization',
    );
    const otherScopeId = Buffer.alloc(32, 10).toString('base64url');
    const otherScope = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...crowdedScope.toPrimitives(),
      scopeId: otherScopeId,
    });
    const otherScopeOperation = PrivateControlOperation.fromPrimitives({
      ...overflow.toPrimitives(),
      scopeId: otherScopeId,
    });
    expect(() => gate.issue(otherScope, otherScopeOperation)).not.toThrow();
  });
});
