import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import LegacyIdentityDeviceBinding from '@app/contexts/private-authorization/infrastructure/crypto/LegacyIdentityDeviceBinding';
import PrivateControlTransitionVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateControlTransitionVerifier';
import PrivateMlsPolicyVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateMlsPolicyVerifier';
import VerifiedPrivateControlTransitionProcessor from '@app/contexts/private-authorization/infrastructure/crypto/VerifiedPrivateControlTransitionProcessor';
import canonicalize from 'canonicalize';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'crypto';

describe('VerifiedPrivateControlTransitionProcessor', () => {
  const privateKey = (byte: number) =>
    createPrivateKey({
      format: 'der',
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.alloc(32, byte),
      ]),
      type: 'pkcs8',
    });
  const ownerPrivateKey = privateKey(1);
  const targetPrivateKey = privateKey(2);
  const raw = (key: ReturnType<typeof privateKey>) =>
    createPublicKey(key)
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64url');
  const ownerKey = raw(ownerPrivateKey);
  const targetKey = raw(targetPrivateKey);
  const encoded = (byte: number) =>
    Buffer.alloc(32, byte).toString('base64url');
  const digest = (value: unknown) =>
    createHash('sha256').update(canonicalize(value)!).digest('base64url');
  const scopeId = encoded(3);
  const currentPolicy = {
    authorityKeys: [ownerKey],
    devices: [ownerKey, targetKey].map((deviceKey, index) => ({
      deviceKey,
      mlsCredentialHash: encoded(10 + index),
    })),
    freshnessAuthorityKey: ownerKey,
    leaseRevocationHpkeKey: encoded(8),
    leaseRevocationKey: ownerKey,
    sequencerKey: ownerKey,
    threshold: 1,
    version: 1,
  };
  const currentControl = {
    headHash: encoded(4),
    mlsEpoch: 0,
    policy: currentPolicy,
    revision: 0,
    scopeId,
  };
  const checkpoint = PrivateAuthorizationCheckpoint.genesis({
    admittedDeviceKeys: [ownerKey, targetKey],
    authorityKeys: [ownerKey],
    controlCheckpointJson: JSON.stringify(currentControl),
    freshnessAuthorityKey: ownerKey,
    headHash: currentControl.headHash,
    scopeId,
  });

  it('verifies a prior-authority-signed revocation against exact message and state bytes', async () => {
    const message = Buffer.from('control-message');
    const state = Buffer.from('protected-state');
    const policy = {
      ...currentPolicy,
      devices: currentPolicy.devices.filter(
        (device) => device.deviceKey !== targetKey,
      ),
    };
    const head = {
      mlsContextHash: createHash('sha256').update(state).digest('base64url'),
      mlsEpoch: 1,
      parentHeadHash: currentControl.headHash,
      policyHash: digest(policy),
      revision: 1,
      scopeId,
    };
    const unsigned = {
      ...head,
      headHash: digest(head),
      mlsMessageHash: createHash('sha256')
        .update(message)
        .digest('base64url'),
      policy,
    };
    const signedTransitionJson = JSON.stringify({
      ...unsigned,
      signatures: {
        [ownerKey]: sign(
          null,
          Buffer.from(
            `pigeon.private-control.v1\0${canonicalize(unsigned)}`,
          ),
          ownerPrivateKey,
        ).toString('base64url'),
      },
    });
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorizationRevision: 0,
      byteSize: 1,
      control: { resultingHeadHash: unsigned.headHash },
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      kind: 'device.revoke',
      mutation: { deviceKey: targetKey, type: 'device.revoke' },
      previousOperationIds: [],
      scopeId,
    });
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      new LegacyIdentityDeviceBinding(),
    );

    const result = await processor.verify(
      checkpoint,
      operation,
      {
        encryptedMlsState: state.toString('base64url'),
        mlsMessage: message.toString('base64url'),
        signedTransitionJson,
      },
      Buffer.from('previous-state').toString('base64url'),
    );

    expect(result.checkpoint.toPrimitives()).toMatchObject({
      admittedDeviceKeys: [ownerKey],
      headHash: unsigned.headHash,
      revokedDeviceKeys: [targetKey],
      revision: 1,
    });
    expect(result.protectedMlsState).toBe(state.toString('base64url'));
  });

  it('rejects a signed transition that removes the target and injects another device', async () => {
    const message = Buffer.from('control-message');
    const state = Buffer.from('protected-state');
    const policy = {
      ...currentPolicy,
      devices: [
        currentPolicy.devices[0],
        { deviceKey: encoded(20), mlsCredentialHash: encoded(21) },
      ],
    };
    const head = {
      mlsContextHash: createHash('sha256').update(state).digest('base64url'),
      mlsEpoch: 1,
      parentHeadHash: currentControl.headHash,
      policyHash: digest(policy),
      revision: 1,
      scopeId,
    };
    const unsigned = {
      ...head,
      headHash: digest(head),
      mlsMessageHash: createHash('sha256')
        .update(message)
        .digest('base64url'),
      policy,
    };
    const signedTransitionJson = JSON.stringify({
      ...unsigned,
      signatures: {
        [ownerKey]: sign(
          null,
          Buffer.from(
            `pigeon.private-control.v1\0${canonicalize(unsigned)}`,
          ),
          ownerPrivateKey,
        ).toString('base64url'),
      },
    });
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorizationRevision: 0,
      byteSize: 1,
      control: { resultingHeadHash: unsigned.headHash },
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      kind: 'device.revoke',
      mutation: { deviceKey: targetKey, type: 'device.revoke' },
      previousOperationIds: [],
      scopeId,
    });
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      new LegacyIdentityDeviceBinding(),
    );

    await expect(
      processor.verify(
        checkpoint,
        operation,
        {
          encryptedMlsState: state.toString('base64url'),
          mlsMessage: message.toString('base64url'),
          signedTransitionJson,
        },
        Buffer.from('previous-state').toString('base64url'),
      ),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('rejects admission when the identity does not own the admitted device key', () => {
    const binding = new LegacyIdentityDeviceBinding();
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      binding,
    );
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorizationRevision: 0,
      byteSize: 1,
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      kind: 'membership.commit',
      mutation: {
        deviceKey: targetKey,
        identityId: binding.identityIdFor(encoded(20)),
        mlsCredentialHash: encoded(21),
        type: 'member.admit',
      },
      previousOperationIds: [],
      scopeId,
    });

    expect(() =>
      (
        processor as unknown as {
          expectedPolicyDevices(
            current: PrivateAuthorizationCheckpoint,
            candidate: PrivateControlOperation,
          ): unknown;
        }
      ).expectedPolicyDevices(checkpoint, operation),
    ).toThrow('Invalid private authorization');
  });
});
