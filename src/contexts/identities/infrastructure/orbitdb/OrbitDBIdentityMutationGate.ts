import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';

/**
 * Admits a replicated identity record only when it embeds a self-signed
 * identity whose canonical content id is the record id. The identity id is the
 * public key that verifies the signature, so a peer can replay an identity but
 * never forge, alter or plant one under another identity's or handle's head
 * key. Every redundant field must repeat the signed value, and the sender
 * cannot supply freshness or tombstone fields.
 */
export class OrbitDBIdentityMutationGate extends OrbitDBMutationGate {
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

  public static readonly COLLECTION = 'identities';
  public static readonly IDENTITY_HEAD_PREFIX = 'identity:';
  public static readonly HANDLE_HEAD_PREFIX = 'identity-handle:';
  public static readonly MAX_RECORD_BYTES = 64 * 1024;
  public static readonly MAX_NETWORKS = 32;

  private readonly mapper = new IpfsIdentityMapper();

  constructor(private readonly ipfsManager: IPFS) {
    super();
  }

  private hasOnlyAllowedKeys(record: Record<string, unknown>): boolean {
    return Object.keys(record).every((key) =>
      OrbitDBIdentityMutationGate.ALLOWED_KEYS.includes(key),
    );
  }

  private isWithinSizeLimit(record: Record<string, unknown>): boolean {
    return (
      Buffer.byteLength(JSON.stringify(record)) <=
      OrbitDBIdentityMutationGate.MAX_RECORD_BYTES
    );
  }

  private identityFrom(record: Record<string, unknown>): Identity | undefined {
    const { identity } = record;

    if (typeof identity !== 'object' || identity === null) {
      return undefined;
    }

    return Identity.fromPrimitives(identity as IdentityPrimitives);
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

  private async isCanonical(
    identity: Identity,
    cid: unknown,
  ): Promise<boolean> {
    const calculated = await this.ipfsManager.calculateJSONId(
      this.mapper.toDocument(identity),
    );

    return typeof cid === 'string' && calculated.valueOf() === cid;
  }

  private hasAdmissibleShape(record: Record<string, unknown>): boolean {
    return (
      record.deleted === undefined &&
      record.receivedAt === undefined &&
      this.hasOnlyAllowedKeys(record) &&
      this.isWithinSizeLimit(record) &&
      typeof record.cid === 'string' &&
      record.id === record.cid
    );
  }

  private async authenticIdentity(
    record: Record<string, unknown>,
  ): Promise<Identity | undefined> {
    try {
      if (!this.hasAdmissibleShape(record)) return undefined;

      const identity = this.identityFrom(record);

      if (!identity) return undefined;

      const signed = identity.toPrimitives();

      return signed.networks.length <=
        OrbitDBIdentityMutationGate.MAX_NETWORKS &&
        this.repeatsSignedFields(record, signed) &&
        (await this.isCanonical(identity, record.cid))
        ? identity
        : undefined;
    } catch {
      return undefined;
    }
  }

  public governs(collection: string): boolean {
    return collection === OrbitDBIdentityMutationGate.COLLECTION;
  }

  public async accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.governs(collection)) return true;

    return (await this.authenticIdentity(record)) !== undefined;
  }

  public governsHead(key: string): boolean {
    return (
      key.startsWith(OrbitDBIdentityMutationGate.IDENTITY_HEAD_PREFIX) ||
      key.startsWith(OrbitDBIdentityMutationGate.HANDLE_HEAD_PREFIX)
    );
  }

  public async acceptsHead(
    key: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.governsHead(key)) return true;

    const identity = await this.authenticIdentity(record);

    if (!identity) return false;

    const signed = identity.toPrimitives();
    const bound = key.startsWith(
      OrbitDBIdentityMutationGate.IDENTITY_HEAD_PREFIX,
    )
      ? `${OrbitDBIdentityMutationGate.IDENTITY_HEAD_PREFIX}${signed.id}`
      : `${OrbitDBIdentityMutationGate.HANDLE_HEAD_PREFIX}${String(signed.profile.handle)}`;

    return key === bound;
  }
}
