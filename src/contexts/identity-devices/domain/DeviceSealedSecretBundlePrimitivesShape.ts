import {
  DeviceSealedSecretBundlePrimitives,
  DeviceSealedSecretEntryPrimitives,
} from './DeviceSealedSecretBundle';

/**
 * Checks that a stored sealed-secret bundle carries every field
 * DeviceSealedSecretBundle.fromPrimitives reads, so a malformed record is
 * rejected before the domain parses its values.
 */
export class DeviceSealedSecretBundlePrimitivesShape {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isEntry(
    value: unknown,
  ): value is DeviceSealedSecretEntryPrimitives {
    return (
      this.isRecord(value) &&
      typeof value.recipientCredential === 'string' &&
      typeof value.sealedSecret === 'string' &&
      typeof value.signature === 'string'
    );
  }

  public static isBundlePrimitives(
    value: unknown,
  ): value is DeviceSealedSecretBundlePrimitives {
    return (
      this.isRecord(value) &&
      typeof value.identityId === 'string' &&
      typeof value.publisherCredential === 'string' &&
      typeof value.authorizationRevision === 'number' &&
      typeof value.generation === 'number' &&
      Array.isArray(value.entries) &&
      value.entries.every((entry) => this.isEntry(entry))
    );
  }
}
