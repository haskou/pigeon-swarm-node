import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpointPrimitives } from './PrivateAuthorizationCheckpointPrimitives';
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

    if (invalidIdentity || invalidRevision || invalidKeys) {
      throw new InvalidPrivateAuthorizationError();
    }
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

  public toPrimitives(): PrivateAuthorizationCheckpointPrimitives {
    return {
      ...this.primitives,
      admittedDeviceKeys: [...this.primitives.admittedDeviceKeys],
      authorityKeys: [...this.primitives.authorityKeys],
      revokedDeviceKeys: [...this.primitives.revokedDeviceKeys],
    };
  }
}
