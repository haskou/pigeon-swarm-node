import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { UniqueObjectArray, assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpointPrimitives } from './PrivateAuthorizationCheckpointPrimitives';
import { PrivateAuthorizationDeviceKey } from './value-objects/PrivateAuthorizationDeviceKey';
import { PrivateAuthorizationRevision } from './value-objects/PrivateAuthorizationRevision';
import { PrivateAuthorizationScopeId } from './value-objects/PrivateAuthorizationScopeId';

export class PrivateAuthorizationCheckpoint {
  private static readonly MAX_REVOKED_DEVICE_KEYS = 128;
  public static genesis(
    primitives: Omit<
      PrivateAuthorizationCheckpointPrimitives,
      'parentHeadHash' | 'revision' | 'revokedDeviceKeys'
    >,
  ): PrivateAuthorizationCheckpoint {
    return PrivateAuthorizationCheckpoint.fromPrimitives({
      ...primitives,
      parentHeadHash: null,
      revision: 0,
      revokedDeviceKeys: [],
    });
  }

  public static fromPrimitives(
    primitives: PrivateAuthorizationCheckpointPrimitives,
  ): PrivateAuthorizationCheckpoint {
    const checkpoint = new PrivateAuthorizationCheckpoint(primitives);
    checkpoint.assertInternallyConsistent();

    return checkpoint;
  }

  private constructor(
    private readonly primitives: PrivateAuthorizationCheckpointPrimitives,
  ) {}

  private assertInternallyConsistent(): void {
    const {
      admittedDeviceKeys,
      authorityKeys,
      controlCheckpointJson,
      deviceIdentities,
      freshnessAuthorityKey,
      headHash,
      parentHeadHash,
      revision,
      revokedDeviceKeys,
      scopeId,
    } = this.primitives;
    const admitted = new Set(admittedDeviceKeys);
    const revoked = new Set(revokedDeviceKeys);
    const unique = (values: string[]): boolean =>
      values.length === new Set(values).size;

    const invalidIdentity =
      !scopeId || !headHash || !controlCheckpointJson || !freshnessAuthorityKey;
    const invalidRevision = this.invalidRevision(revision, parentHeadHash);
    const invalidKeys = this.invalidKeys(
      admittedDeviceKeys,
      authorityKeys,
      revokedDeviceKeys,
      admitted,
      revoked,
      unique,
      freshnessAuthorityKey,
    );
    const invalidDeviceIdentities = this.invalidDeviceIdentities(
      admittedDeviceKeys,
      revokedDeviceKeys,
      deviceIdentities,
    );

    if (
      invalidIdentity ||
      invalidRevision ||
      invalidKeys ||
      invalidDeviceIdentities
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private invalidDeviceIdentities(
    admittedDeviceKeys: string[],
    revokedDeviceKeys: string[],
    deviceIdentities: Array<{ deviceKey: string; identityId: string }>,
  ): boolean {
    const mappedDeviceKeys = deviceIdentities.map(
      (identity) => identity.deviceKey,
    );
    const recognizedDeviceKeys = new Set([
      ...admittedDeviceKeys,
      ...revokedDeviceKeys,
    ]);
    const hasDuplicate =
      new Set(mappedDeviceKeys).size !== mappedDeviceKeys.length;
    const hasUnknown = mappedDeviceKeys.some(
      (key) => !recognizedDeviceKeys.has(key),
    );
    const hasUnmappedAdmission = admittedDeviceKeys.some(
      (key) => !mappedDeviceKeys.includes(key),
    );
    const hasEmptyValue = deviceIdentities.some(
      (identity) => !identity.deviceKey || !identity.identityId,
    );

    return hasDuplicate || hasUnknown || hasUnmappedAdmission || hasEmptyValue;
  }

  private invalidRevision(
    revision: number,
    parentHeadHash: string | null,
  ): boolean {
    if (!Number.isSafeInteger(revision) || revision < 0) return true;

    return revision === 0 ? parentHeadHash !== null : !parentHeadHash;
  }

  private invalidKeys(
    admittedDeviceKeys: string[],
    authorityKeys: string[],
    revokedDeviceKeys: string[],
    admitted: Set<string>,
    revoked: Set<string>,
    unique: (values: string[]) => boolean,
    freshnessAuthorityKey: string,
  ): boolean {
    const duplicateKey =
      !unique(admittedDeviceKeys) ||
      !unique(authorityKeys) ||
      !unique(revokedDeviceKeys);
    const invalidAuthority =
      authorityKeys.some((key) => !admitted.has(key)) ||
      !admitted.has(freshnessAuthorityKey);
    const invalidRevocation = revokedDeviceKeys.some(
      (key) => admitted.has(key) || !key,
    );

    return (
      duplicateKey ||
      invalidAuthority ||
      invalidRevocation ||
      revoked.size > PrivateAuthorizationCheckpoint.MAX_REVOKED_DEVICE_KEYS ||
      revoked.has('')
    );
  }

  public getScopeId(): PrivateAuthorizationScopeId {
    return new PrivateAuthorizationScopeId(this.primitives.scopeId);
  }

  public getRevision(): PrivateAuthorizationRevision {
    return new PrivateAuthorizationRevision(this.primitives.revision);
  }

  public getFreshnessAuthorityKey(): PrivateAuthorizationDeviceKey {
    return new PrivateAuthorizationDeviceKey(
      this.primitives.freshnessAuthorityKey,
    );
  }

  public authorizes(deviceKey: PrivateAuthorizationDeviceKey): boolean {
    return this.primitives.authorityKeys.includes(deviceKey.valueOf());
  }

  public admits(deviceKey: PrivateAuthorizationDeviceKey): boolean {
    return this.primitives.admittedDeviceKeys.includes(deviceKey.valueOf());
  }

  public recognizes(deviceKey: PrivateAuthorizationDeviceKey): boolean {
    return (
      this.admits(deviceKey) ||
      this.primitives.revokedDeviceKeys.includes(deviceKey.valueOf())
    );
  }

  public identityFor(deviceKey: PrivateAuthorizationDeviceKey): IdentityId {
    const device = this.primitives.deviceIdentities.find(
      (candidate) => candidate.deviceKey === deviceKey.valueOf(),
    );

    assert(device, new InvalidPrivateAuthorizationError());

    return new IdentityId(device.identityId);
  }

  public deviceKeysFor(
    identityId: IdentityId,
  ): PrivateAuthorizationDeviceKey[] {
    return this.primitives.deviceIdentities
      .filter((device) => device.identityId === identityId.valueOf())
      .map((device) => new PrivateAuthorizationDeviceKey(device.deviceKey));
  }

  public admitsIdentityDevice(
    identityId: IdentityId,
    deviceKey: PrivateAuthorizationDeviceKey,
  ): boolean {
    return (
      this.admits(deviceKey) && this.identityFor(deviceKey).isEqual(identityId)
    );
  }

  public revocationHistoryAfter(
    admittedDeviceKeys: PrivateAuthorizationDeviceKey[],
  ): PrivateAuthorizationDeviceKey[] {
    const admitted = UniqueObjectArray.fromArray(admittedDeviceKeys);
    const revoked = UniqueObjectArray.fromArray(
      this.primitives.revokedDeviceKeys
        .map((key) => new PrivateAuthorizationDeviceKey(key))
        .filter((key) => !admitted.includes(key)),
    ).push(
      ...this.primitives.admittedDeviceKeys
        .map((key) => new PrivateAuthorizationDeviceKey(key))
        .filter((key) => !admitted.includes(key)),
    );

    return revoked
      .toArray()
      .slice(-PrivateAuthorizationCheckpoint.MAX_REVOKED_DEVICE_KEYS);
  }

  public toPrimitives(): PrivateAuthorizationCheckpointPrimitives {
    return {
      ...this.primitives,
      admittedDeviceKeys: [...this.primitives.admittedDeviceKeys],
      authorityKeys: [...this.primitives.authorityKeys],
      deviceIdentities: this.primitives.deviceIdentities.map((identity) => ({
        ...identity,
      })),
      revokedDeviceKeys: [...this.primitives.revokedDeviceKeys],
    };
  }
}
