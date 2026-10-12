import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitivesShape } from '@app/contexts/identities/domain/IdentityPrimitivesShape';
import IdentityRecordAdmissionDomainService from '@app/contexts/identities/domain/services/IdentityRecordAdmissionDomainService';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';

/**
 * Gates replicated identity records and identity head keys. Admission rules
 * live in IdentityRecordAdmissionDomainService; this adapter parses the
 * replicated record, computes its canonical content id, and binds head keys
 * to the identity they name.
 */
export class OrbitDBIdentityMutationGate extends OrbitDBMutationGate {
  public static readonly COLLECTION = 'identities';
  public static readonly IDENTITY_HEAD_PREFIX = 'identity:';
  public static readonly HANDLE_HEAD_PREFIX = 'identity-handle:';

  private readonly mapper = new IpfsIdentityMapper();
  private readonly admission = new IdentityRecordAdmissionDomainService();

  constructor(private readonly ipfsManager: IPFS) {
    super();
  }

  private identityFrom(record: Record<string, unknown>): Identity | undefined {
    const { identity } = record;

    if (!IdentityPrimitivesShape.isIdentityPrimitives(identity)) {
      return undefined;
    }

    return Identity.fromPrimitives(identity);
  }

  private async authenticIdentity(
    record: Record<string, unknown>,
  ): Promise<Identity | undefined> {
    try {
      const serializedBytes = Buffer.byteLength(JSON.stringify(record));

      if (!this.admission.admitsShape(record, serializedBytes)) {
        return undefined;
      }

      const identity = this.identityFrom(record);

      if (!identity || !this.admission.admitsIdentity(identity, record)) {
        return undefined;
      }

      const calculated = await this.ipfsManager.calculateJSONId(
        this.mapper.toDocument(identity),
      );

      return this.admission.admitsCanonicalCid(record.cid, calculated.valueOf())
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
