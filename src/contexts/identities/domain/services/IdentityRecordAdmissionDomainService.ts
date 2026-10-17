import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';

/**
 * Decides whether a replicated identity record is admissible. A record is
 * admitted only when it embeds a self-signed identity whose canonical content
 * id is the record id, and whose id is the canonical encoding of its key.
 * Every redundant field must repeat the signed value, and the sender cannot
 * supply freshness or tombstone fields. Records are checked on every load, so
 * one stored before ids had to be canonical is never held, even if it was
 * persisted then.
 */
export default class IdentityRecordAdmissionDomainService {
  private static readonly ALLOWED_KEYS: readonly string[] = [
    'cid',
    'handle',
    'id',
    'identity',
    'identityId',
    'networkIds',
    'previousCid',
    'version',
  ];

  public static readonly MAX_RECORD_BYTES = 64 * 1024;
  public static readonly MAX_NETWORKS = 32;

  private hasOnlyAllowedKeys(record: Record<string, unknown>): boolean {
    return Object.keys(record).every((key) =>
      IdentityRecordAdmissionDomainService.ALLOWED_KEYS.includes(key),
    );
  }

  private repeatsSignedFields(
    record: Record<string, unknown>,
    signed: IdentityPrimitives,
  ): boolean {
    return (
      record.identityId === signed.id &&
      (record.handle ?? undefined) === signed.profile.handle &&
      (record.previousCid ?? undefined) ===
        signed.previousIdentityExternalIdentifier &&
      record.version === signed.version &&
      this.repeatsNetworks(record.networkIds, signed.networks)
    );
  }

  private repeatsNetworks(value: unknown, signed: string[]): boolean {
    return (
      Array.isArray(value) &&
      value.length === signed.length &&
      value.every((networkId, index) => networkId === signed[index])
    );
  }

  /**
   * `serializedBytes` is the record's encoded size, measured by the caller.
   */
  public admitsShape(
    record: Record<string, unknown>,
    serializedBytes: number,
  ): boolean {
    return (
      record.deleted === undefined &&
      record.receivedAt === undefined &&
      this.hasOnlyAllowedKeys(record) &&
      serializedBytes <=
        IdentityRecordAdmissionDomainService.MAX_RECORD_BYTES &&
      typeof record.cid === 'string' &&
      record.id === record.cid
    );
  }

  public admitsIdentity(
    identity: Identity,
    record: Record<string, unknown>,
  ): boolean {
    const signed = identity.toPrimitives();

    return (
      signed.networks.length <=
        IdentityRecordAdmissionDomainService.MAX_NETWORKS &&
      identity.getId().isCanonicalKey() &&
      identity.hasValidAdmissionProof() &&
      this.repeatsSignedFields(record, signed)
    );
  }

  /**
   * `calculatedCid` is the content id the caller computed for the identity.
   */
  public admitsCanonicalCid(cid: unknown, calculatedCid: string): boolean {
    return typeof cid === 'string' && calculatedCid === cid;
  }
}
