import { PrivateAuthorizationCheckpointPrimitives } from './PrivateAuthorizationCheckpointPrimitives';
import { PrivateAuthorizationScopePrimitives } from './PrivateAuthorizationScopePrimitives';
import { PrivateControlOperationPrimitives } from './PrivateControlOperationPrimitives';

export type StoredPrivateAuthorizationScopePrimitives = Omit<
  PrivateAuthorizationScopePrimitives,
  'pendingOperations'
>;

/**
 * Checks that stored private-authorization records carry every field the
 * domain reads, so a malformed record is rejected instead of being cast.
 */
export class PrivateAuthorizationPrimitivesShape {
  private static readonly checkpointFieldTypes: Record<string, string> = {
    controlCheckpointJson: 'string',
    freshnessAuthorityKey: 'string',
    headHash: 'string',
    revision: 'number',
    scopeId: 'string',
  };

  private static readonly operationFieldTypes: Record<string, string> = {
    authorDeviceKey: 'string',
    authorIdentityId: 'string',
    authorizationRevision: 'number',
    byteSize: 'number',
    digest: 'string',
    id: 'string',
    identityAuthorizationEpoch: 'string',
    identityAuthorizationRevision: 'number',
    kind: 'string',
    scopeId: 'string',
  };

  private static hasFieldTypes(
    value: Record<string, unknown>,
    fieldTypes: Record<string, string>,
  ): boolean {
    return Object.entries(fieldTypes).every(
      ([field, type]) => typeof value[field] === type,
    );
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private static isDeviceIdentity(
    value: unknown,
  ): value is { deviceKey: string; identityId: string } {
    return (
      this.isRecord(value) &&
      typeof value.deviceKey === 'string' &&
      typeof value.identityId === 'string'
    );
  }

  public static isCheckpointPrimitives(
    value: unknown,
  ): value is PrivateAuthorizationCheckpointPrimitives {
    if (!this.isRecord(value)) return false;
    const parentHeadHash = value.parentHeadHash;

    return [
      this.hasFieldTypes(value, this.checkpointFieldTypes),
      this.isStringArray(value.admittedDeviceKeys),
      this.isStringArray(value.authorityKeys),
      this.isStringArray(value.revokedDeviceKeys),
      Array.isArray(value.deviceIdentities) &&
        value.deviceIdentities.every((item) => this.isDeviceIdentity(item)),
      parentHeadHash === null || typeof parentHeadHash === 'string',
    ].every(Boolean);
  }

  public static isOperationPrimitives(
    value: unknown,
  ): value is PrivateControlOperationPrimitives {
    if (!this.isRecord(value)) return false;

    return [
      this.hasFieldTypes(value, this.operationFieldTypes),
      this.isStringArray(value.previousOperationIds),
      this.isRecord(value.mutation),
      value.control === undefined || this.isRecord(value.control),
      value.proposalOperationId === undefined ||
        typeof value.proposalOperationId === 'string',
    ].every(Boolean);
  }

  public static isStoredScopePrimitives(
    value: unknown,
  ): value is StoredPrivateAuthorizationScopePrimitives {
    return (
      this.isRecord(value) &&
      Array.isArray(value.acceptedOperations) &&
      value.acceptedOperations.every((operation) =>
        this.isOperationPrimitives(operation),
      ) &&
      this.isCheckpointPrimitives(value.checkpoint) &&
      typeof value.genesisHash === 'string' &&
      typeof value.ownerDeviceKey === 'string' &&
      (value.status === 'active' || value.status === 'frozen')
    );
  }
}
