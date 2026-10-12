import { IdentityPrimitives } from './IdentityPrimitives';

/**
 * Checks that identity primitives read from storage carry every field that
 * Identity.fromPrimitives reads without a domain default, so malformed records
 * are rejected before they reach the identity domain. Profile text and the
 * previous identifier are read through truthy checks, so falsy values are
 * accepted in those forms; the admission nonce and mailbox home are passed
 * through or compared with undefined, so only absent or text values are
 * accepted.
 */
export class IdentityPrimitivesShape {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
  }

  private static isFalsyOrString(value: unknown): boolean {
    return !value || typeof value === 'string';
  }

  private static isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private static isProfile(value: unknown): boolean {
    return (
      this.isRecord(value) &&
      typeof value.name === 'string' &&
      this.isFalsyOrString(value.banner) &&
      this.isFalsyOrString(value.biography) &&
      this.isFalsyOrString(value.handle) &&
      this.isFalsyOrString(value.picture)
    );
  }

  private static hasIdentityFields(value: Record<string, unknown>): boolean {
    return (
      this.isOptionalString(value.admissionNonce) &&
      typeof value.authorizationRevision === 'number' &&
      typeof value.id === 'string' &&
      this.isOptionalString(value.mailboxHome) &&
      this.isStringArray(value.networks)
    );
  }

  private static hasCredentialFields(value: Record<string, unknown>): boolean {
    return (
      typeof value.deviceCredential === 'string' &&
      typeof value.deviceCredentialCommitment === 'string' &&
      typeof value.recoveryAuthority === 'string' &&
      typeof value.signature === 'string'
    );
  }

  private static hasVersionFields(value: Record<string, unknown>): boolean {
    return (
      this.isFalsyOrString(value.previousIdentityExternalIdentifier) &&
      typeof value.timestamp === 'number' &&
      typeof value.version === 'number'
    );
  }

  public static isIdentityPrimitives(
    value: unknown,
  ): value is IdentityPrimitives {
    return (
      this.isRecord(value) &&
      this.hasIdentityFields(value) &&
      this.hasCredentialFields(value) &&
      this.hasVersionFields(value) &&
      this.isProfile(value.profile)
    );
  }
}
