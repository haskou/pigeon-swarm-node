import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import DeviceAuthorizationAccessPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationAccessPolicy';
import { AuthenticatedPrivateOperationJson } from '@app/contexts/private-authorization/domain/value-objects/AuthenticatedPrivateOperationJson';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Ed25519PrivateDeviceCredentialCodec from '@app/contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import PrivateControlTransitionVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateControlTransitionVerifier';
import PrivateMlsPolicyVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateMlsPolicyVerifier';
import VerifiedPrivateControlTransitionProcessor from '@app/contexts/private-authorization/infrastructure/crypto/VerifiedPrivateControlTransitionProcessor';
import canonicalize from 'canonicalize';
import { PrivateOperationSignature } from '@haskou/pigeon-swarm-crypto';
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
  const deviceAuthorization = {
    assertAuthorized: jest.fn(),
  } as unknown as jest.Mocked<DeviceAuthorizationAccessPolicy>;
  const credentialCodec = new Ed25519PrivateDeviceCredentialCodec();
  const identityIdFor = (deviceKey: string) =>
    new IdentityId(
      credentialCodec
        .toCredential(new PrivateAuthorizationDeviceKey(deviceKey))
        .valueOf(),
    ).valueOf();
  const encoded = (byte: number) =>
    Buffer.alloc(32, byte).toString('base64url');
  const digest = (value: unknown) =>
    createHash('sha256').update(canonicalize(value)!).digest('base64url');
  const scopeId = encoded(3);
  const authenticatedOperation = (
    kind: string,
    payload: Record<string, unknown>,
    resultingHeadHash: string,
  ) =>
    new AuthenticatedPrivateOperationJson(
      JSON.stringify({
        authorDeviceKey: ownerKey,
        authorizationRevision: 0,
        kind,
        operationId: Buffer.alloc(16, 1).toString('base64url'),
        payload: {
          authorIdentityId: identityIdFor(ownerKey),
          identityAuthorizationRevision: 0,
          ...payload,
          resultingHeadHash,
        },
        previousOperationIds: [],
        scopeId,
        signature: Buffer.alloc(64, 1).toString('base64url'),
        version: 1,
      }),
    );
  const operationBindingHash = (
    kind: string,
    payload: Record<string, unknown>,
  ) =>
    PrivateOperationSignature.bindingHash(
      authenticatedOperation(kind, payload, encoded(0)).valueOf(),
    );
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
    deviceIdentities: [
      { deviceKey: ownerKey, identityId: identityIdFor(ownerKey) },
      { deviceKey: targetKey, identityId: identityIdFor(targetKey) },
    ],
    freshnessAuthorityKey: ownerKey,
    headHash: currentControl.headHash,
    scopeId,
  });

  it('verifies a prior-authority-signed revocation against exact message and state bytes', async () => {
    const historicalRevokedKeys = Array.from({ length: 128 }, (_value, index) =>
      Buffer.alloc(32, index + 30).toString('base64url'),
    );
    const checkpointWithHistory = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint.toPrimitives(),
      revokedDeviceKeys: historicalRevokedKeys,
    });
    const message = Buffer.from('control-message');
    const state = Buffer.from('protected-state');
    const policy = {
      ...currentPolicy,
      devices: currentPolicy.devices.filter(
        (device) => device.deviceKey !== targetKey,
      ),
    };
    const operationPayload = { deviceKey: targetKey };
    const head = {
      mlsContextHash: createHash('sha256').update(state).digest('base64url'),
      mlsEpoch: 1,
      operationBindingHash: operationBindingHash(
        'device.revoke',
        operationPayload,
      ),
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
            `pigeon.private-control.v2\0${canonicalize(unsigned)}`,
          ),
          ownerPrivateKey,
        ).toString('base64url'),
      },
    });
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorIdentityId: identityIdFor(ownerKey),
      authorizationRevision: 0,
      byteSize: 1,
      control: { resultingHeadHash: unsigned.headHash },
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      identityAuthorizationRevision: 0,
      kind: 'device.revoke',
      mutation: { deviceKey: targetKey, type: 'device.revoke' },
      previousOperationIds: [],
      scopeId,
    });
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      deviceAuthorization,
      credentialCodec,
    );

    const result = await processor.verify(
      checkpointWithHistory,
      operation,
      authenticatedOperation(
        'device.revoke',
        operationPayload,
        unsigned.headHash,
      ),
      {
        encryptedMlsState: state.toString('base64url'),
        mlsMessage: message.toString('base64url'),
        signedTransitionJson,
      },
    );

    expect(result.checkpoint.toPrimitives()).toMatchObject({
      admittedDeviceKeys: [ownerKey],
      headHash: unsigned.headHash,
      revision: 1,
    });
    expect(result.checkpoint.toPrimitives().revokedDeviceKeys).toHaveLength(128);
    expect(result.checkpoint.toPrimitives().revokedDeviceKeys).toContain(
      targetKey,
    );
    expect(result.checkpoint.toPrimitives().revokedDeviceKeys).not.toContain(
      historicalRevokedKeys[0],
    );
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
    const operationPayload = { deviceKey: targetKey };
    const head = {
      mlsContextHash: createHash('sha256').update(state).digest('base64url'),
      mlsEpoch: 1,
      operationBindingHash: operationBindingHash(
        'device.revoke',
        operationPayload,
      ),
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
            `pigeon.private-control.v2\0${canonicalize(unsigned)}`,
          ),
          ownerPrivateKey,
        ).toString('base64url'),
      },
    });
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorIdentityId: identityIdFor(ownerKey),
      authorizationRevision: 0,
      byteSize: 1,
      control: { resultingHeadHash: unsigned.headHash },
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      identityAuthorizationRevision: 0,
      kind: 'device.revoke',
      mutation: { deviceKey: targetKey, type: 'device.revoke' },
      previousOperationIds: [],
      scopeId,
    });
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      deviceAuthorization,
      credentialCodec,
    );

    await expect(
      processor.verify(
        checkpoint,
        operation,
        authenticatedOperation(
          'device.revoke',
          operationPayload,
          unsigned.headHash,
        ),
        {
          encryptedMlsState: state.toString('base64url'),
          mlsMessage: message.toString('base64url'),
          signedTransitionJson,
        },
      ),
    ).rejects.toThrow('Invalid private authorization');
  });

  it('rejects admission when the identity does not own the admitted device key', async () => {
    deviceAuthorization.assertAuthorized.mockRejectedValueOnce(
      new Error('device does not belong to identity'),
    );
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      deviceAuthorization,
      credentialCodec,
    );
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorIdentityId: identityIdFor(ownerKey),
      authorizationRevision: 0,
      byteSize: 1,
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      identityAuthorizationRevision: 0,
      kind: 'membership.commit',
      mutation: {
        deviceKey: targetKey,
        identityId: identityIdFor(encoded(20)),
        identityAuthorizationRevision: 0,
        mlsCredentialHash: encoded(21),
        type: 'member.admit',
      },
      previousOperationIds: [],
      scopeId,
    });

    await expect(
      (
        processor as unknown as {
          expectedPolicyDevices(
            current: PrivateAuthorizationCheckpoint,
            candidate: PrivateControlOperation,
          ): Promise<unknown>;
        }
      ).expectedPolicyDevices(checkpoint, operation),
    ).rejects.toThrow('device does not belong to identity');
  });

  it('removes a re-admitted device key from retained revocation history', async () => {
      const previousPolicy = {
      ...currentPolicy,
      devices: [currentPolicy.devices[0]],
    };
    const previousControl = {
      ...currentControl,
      policy: previousPolicy,
    };
    const previousCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint.toPrimitives(),
      admittedDeviceKeys: [ownerKey],
      controlCheckpointJson: JSON.stringify(previousControl),
      revokedDeviceKeys: [targetKey],
    });
    const message = Buffer.from('re-admission-message');
    const state = Buffer.from('re-admitted-state');
    const operationPayload = {
      deviceKey: targetKey,
      identityId: identityIdFor(targetKey),
      mlsCredentialHash: currentPolicy.devices[1].mlsCredentialHash,
    };
    const head = {
      mlsContextHash: createHash('sha256').update(state).digest('base64url'),
      mlsEpoch: 1,
      operationBindingHash: operationBindingHash(
        'membership.commit',
        operationPayload,
      ),
      parentHeadHash: currentControl.headHash,
      policyHash: digest(currentPolicy),
      revision: 1,
      scopeId,
    };
    const unsigned = {
      ...head,
      headHash: digest(head),
      mlsMessageHash: createHash('sha256')
        .update(message)
        .digest('base64url'),
      policy: currentPolicy,
    };
    const signedTransitionJson = JSON.stringify({
      ...unsigned,
      signatures: {
        [ownerKey]: sign(
          null,
          Buffer.from(
            `pigeon.private-control.v2\0${canonicalize(unsigned)}`,
          ),
          ownerPrivateKey,
        ).toString('base64url'),
      },
    });
    const operation = PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorIdentityId: identityIdFor(ownerKey),
      authorizationRevision: 0,
      byteSize: 1,
      control: { resultingHeadHash: unsigned.headHash },
      digest: encoded(9),
      id: Buffer.alloc(16, 1).toString('base64url'),
      identityAuthorizationRevision: 0,
      kind: 'membership.commit',
      mutation: {
        deviceKey: targetKey,
        identityId: identityIdFor(targetKey),
        identityAuthorizationRevision: 0,
        mlsCredentialHash: currentPolicy.devices[1].mlsCredentialHash,
        type: 'member.admit',
      },
      previousOperationIds: [],
      scopeId,
    });
    const processor = new VerifiedPrivateControlTransitionProcessor(
      new PrivateControlTransitionVerifier(),
      new PrivateMlsPolicyVerifier(),
      deviceAuthorization,
      credentialCodec,
    );

    const result = await processor.verify(
      previousCheckpoint,
      operation,
      authenticatedOperation(
        'membership.commit',
        operationPayload,
        unsigned.headHash,
      ),
      {
        encryptedMlsState: state.toString('base64url'),
        mlsMessage: message.toString('base64url'),
        signedTransitionJson,
      },
    );

    expect(result.checkpoint.toPrimitives()).toMatchObject({
      admittedDeviceKeys: [ownerKey, targetKey],
      revokedDeviceKeys: [],
    });
  });
});
