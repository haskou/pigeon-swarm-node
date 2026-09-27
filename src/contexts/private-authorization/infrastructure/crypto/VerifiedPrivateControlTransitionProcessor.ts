import { PrivateControlFrame } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateControlFrame';
import { PrivateControlTransitionProcessor } from '@app/contexts/private-authorization/application/accept-operation/PrivateControlTransitionProcessor';
import { PrivateVerifiedControlTransition } from '@app/contexts/private-authorization/application/accept-operation/PrivateVerifiedControlTransition';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateMlsPolicyDevice } from '@app/contexts/private-authorization/domain/PrivateMlsPolicyDevice';
import { PrivateIdentityBinding } from '@app/contexts/private-authorization/domain/services/PrivateIdentityBinding';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import { Buffer } from 'buffer';
import { createHash } from 'crypto';

import PrivateControlTransitionVerifier from './PrivateControlTransitionVerifier';
import PrivateMlsPolicyVerifier from './PrivateMlsPolicyVerifier';
import { VerifiedTransition } from './VerifiedPrivateControlTransitionContract';

export default class VerifiedPrivateControlTransitionProcessor extends PrivateControlTransitionProcessor {
  public constructor(
    private readonly verifier: PrivateControlTransitionVerifier,
    private readonly policyVerifier: PrivateMlsPolicyVerifier,
    private readonly identityBinding: PrivateIdentityBinding,
  ) {
    super();
  }

  private bytes(value: string, limit: number): Buffer {
    const decoded = Buffer.from(value, 'base64url');

    if (
      decoded.length === 0 ||
      decoded.length > limit ||
      decoded.toString('base64url') !== value
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    return decoded;
  }

  private hash(value: Buffer): string {
    return createHash('sha256').update(value).digest('base64url');
  }

  private parse(canonical: string): VerifiedTransition {
    try {
      const value = JSON.parse(canonical) as Record<string, unknown>;
      const policy = value.policy as Record<string, unknown>;
      const devices = policy.devices as Array<Record<string, unknown>>;

      if (!this.validTransition(value) || !this.validPolicy(policy, devices)) {
        throw new InvalidPrivateAuthorizationError();
      }

      return {
        headHash: value.headHash as string,
        mlsEpoch: value.mlsEpoch as number,
        parentHeadHash: value.parentHeadHash as string,
        policy: {
          authorityKeys: policy.authorityKeys as string[],
          devices: devices.map((device) => ({
            deviceKey: device.deviceKey as string,
            mlsCredentialHash: device.mlsCredentialHash as string,
          })),
          freshnessAuthorityKey: policy.freshnessAuthorityKey as string,
          leaseRevocationHpkeKey: policy.leaseRevocationHpkeKey as string,
          leaseRevocationKey: policy.leaseRevocationKey as string,
          sequencerKey: policy.sequencerKey as string,
          threshold: policy.threshold as number,
          version: policy.version as number,
        },
        revision: value.revision as number,
        scopeId: value.scopeId as string,
      };
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private validTransition(value: Record<string, unknown>): boolean {
    return (
      typeof value.scopeId === 'string' &&
      typeof value.headHash === 'string' &&
      typeof value.parentHeadHash === 'string' &&
      Number.isSafeInteger(value.revision) &&
      Number.isSafeInteger(value.mlsEpoch)
    );
  }

  private validPolicy(
    policy: Record<string, unknown>,
    devices: Array<Record<string, unknown>>,
  ): boolean {
    return (
      Boolean(policy) &&
      Array.isArray(devices) &&
      Array.isArray(policy.authorityKeys) &&
      this.validPolicyMetadata(policy)
    );
  }

  private validPolicyMetadata(policy: Record<string, unknown>): boolean {
    return (
      typeof policy.freshnessAuthorityKey === 'string' &&
      typeof policy.leaseRevocationHpkeKey === 'string' &&
      typeof policy.leaseRevocationKey === 'string' &&
      typeof policy.sequencerKey === 'string' &&
      Number.isSafeInteger(policy.threshold) &&
      Number.isSafeInteger(policy.version)
    );
  }

  private trustedPolicyDevices(
    checkpoint: PrivateAuthorizationCheckpoint,
  ): PrivateMlsPolicyDevice[] {
    try {
      const control = JSON.parse(
        checkpoint.toPrimitives().controlCheckpointJson,
      ) as Record<string, unknown>;
      const policy = control.policy as Record<string, unknown>;
      const devices = policy.devices as PrivateMlsPolicyDevice[];

      this.policyVerifier.verify(devices, devices);
      const admitted = checkpoint.toPrimitives().admittedDeviceKeys;
      const deviceKeys = devices.map((device) => device.deviceKey);

      if (
        admitted.length !== deviceKeys.length ||
        admitted.some((deviceKey) => !deviceKeys.includes(deviceKey))
      ) {
        throw new InvalidPrivateAuthorizationError();
      }

      return devices;
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private expectedPolicyDevices(
    current: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
  ): PrivateMlsPolicyDevice[] {
    const mutation = operation.toPrimitives().mutation;
    const devices = this.trustedPolicyDevices(current);

    if (mutation.type === 'member.admit') {
      if (
        this.identityBinding.bind(mutation.identityId as string) !==
        mutation.deviceKey
      ) {
        throw new InvalidPrivateAuthorizationError();
      }

      return [
        ...devices,
        {
          deviceKey: mutation.deviceKey as string,
          mlsCredentialHash: mutation.mlsCredentialHash as string,
        },
      ];
    }

    if (mutation.type === 'device.revoke') {
      return devices.filter(
        (device) => device.deviceKey !== mutation.deviceKey,
      );
    }

    if (mutation.type === 'member.remove' || mutation.type === 'member.ban') {
      const targetKey = this.identityBinding.bind(
        mutation.targetIdentityId as string,
      );

      return devices.filter((device) => device.deviceKey !== targetKey);
    }

    if (mutation.type === 'member.roles.set') return devices;

    throw new InvalidPrivateAuthorizationError();
  }

  private controlCheckpointJson(value: VerifiedTransition): string {
    return JSON.stringify({
      headHash: value.headHash,
      mlsEpoch: value.mlsEpoch,
      policy: value.policy,
      revision: value.revision,
      scopeId: value.scopeId,
    });
  }

  private verifyNow(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    frame: PrivateControlFrame,
    currentProtectedMlsState: string,
  ): PrivateVerifiedControlTransition {
    this.bytes(currentProtectedMlsState, 1024 * 1024);
    const mlsMessageHash = this.hash(this.bytes(frame.mlsMessage, 256 * 1024));
    const protectedState = this.bytes(frame.encryptedMlsState, 1024 * 1024);
    const operationControl = operation.toPrimitives().control;

    if (
      operationControl?.mlsMessageHash !== undefined &&
      operationControl.mlsMessageHash !== mlsMessageHash
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
    const trusted = checkpoint.toPrimitives();
    const authenticated = this.verifier.authenticate(
      frame.signedTransitionJson,
      trusted.controlCheckpointJson,
      mlsMessageHash,
    );
    const verified = this.verifier.verify(
      authenticated,
      trusted.controlCheckpointJson,
      mlsMessageHash,
      this.hash(protectedState),
    );
    const candidate = this.parse(verified);

    if (operationControl?.resultingHeadHash !== candidate.headHash) {
      throw new InvalidPrivateAuthorizationError();
    }
    this.policyVerifier.verify(
      candidate.policy.devices,
      this.expectedPolicyDevices(checkpoint, operation),
    );
    const admittedDeviceKeys = candidate.policy.devices.map(
      (device) => device.deviceKey,
    );
    const revokedDeviceKeys = checkpoint
      .revocationHistoryAfter(
        admittedDeviceKeys.map((key) => new PrivateAuthorizationDeviceKey(key)),
      )
      .map((key) => key.valueOf());

    return {
      checkpoint: PrivateAuthorizationCheckpoint.fromPrimitives({
        admittedDeviceKeys,
        authorityKeys: candidate.policy.authorityKeys,
        controlCheckpointJson: this.controlCheckpointJson(candidate),
        freshnessAuthorityKey: candidate.policy.freshnessAuthorityKey,
        headHash: candidate.headHash,
        parentHeadHash: candidate.parentHeadHash,
        revision: candidate.revision,
        revokedDeviceKeys,
        scopeId: candidate.scopeId,
      }),
      protectedMlsState: frame.encryptedMlsState,
    };
  }

  public verify(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    frame: PrivateControlFrame,
    currentProtectedMlsState: string,
  ): Promise<PrivateVerifiedControlTransition> {
    return Promise.resolve().then(() =>
      this.verifyNow(checkpoint, operation, frame, currentProtectedMlsState),
    );
  }
}
