import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import IdentityHandleOwnershipDomainService from '@app/contexts/identities/domain/services/IdentityHandleOwnershipDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import IdentityMetadataIndex from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataIndex';
import { IdentityMetadataRecord } from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { OrbitDBIdentityMetadataDocument } from './documents/OrbitDBIdentityMetadataDocument';

export default class OrbitDBIdentityMetadataIndex extends IdentityMetadataIndex {
  public static readonly MAX_CANDIDATES_PER_IDENTITY = 64;

  private readonly candidatesByIdentityId = new Map<
    string,
    Map<string, IdentityMetadataRecord>
  >();

  private readonly claimantsByHandle = new Map<string, Set<string>>();
  private readonly handlesByIdentityId = new Map<string, Set<string>>();
  private readonly ownership = new IdentityHandleOwnershipDomainService();
  private readonly mapper = new IpfsIdentityMapper();

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly ipfsManager: IPFS,
  ) {
    super();
  }

  private identityFrom(
    document: Record<string, unknown>,
  ): Identity | undefined {
    if (typeof document.identity !== 'object' || document.identity === null) {
      return undefined;
    }

    try {
      return Identity.fromPrimitives(
        document.identity as unknown as IdentityPrimitives,
      );
    } catch {
      return undefined;
    }
  }

  private toRecord(
    document: Record<string, unknown>,
  ): IdentityMetadataRecord | undefined {
    const identity = this.identityFrom(document);

    if (typeof document.cid !== 'string' || !identity) {
      return undefined;
    }

    const primitives = identity.toPrimitives();

    return {
      cid: document.cid,
      handle: primitives.profile.handle,
      identity,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      version: primitives.version,
    };
  }

  private toStorageDocument(
    record: IdentityMetadataRecord,
  ): OrbitDBIdentityMetadataDocument {
    return {
      cid: record.cid,
      handle: record.handle,
      id: record.cid,
      identity: record.identity.toPrimitives(),
      identityId: record.identityId,
      networkIds: record.networkIds,
      previousCid: record.previousCid,
      version: record.version,
    };
  }

  private toCandidate(record: IdentityMetadataRecord): IdentityCandidate {
    return new IdentityCandidate(
      new IdentityExternalIdentifier(record.cid),
      record.identity,
    );
  }

  private deduplicateDocuments(
    documents: IdentityMetadataRecord[],
  ): IdentityMetadataRecord[] {
    const deduplicated = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      deduplicated.set(`${document.identityId}:${document.cid}`, document);
    }

    return this.sortByFreshness([...deduplicated.values()]);
  }

  private sortByFreshness(
    documents: IdentityMetadataRecord[],
  ): IdentityMetadataRecord[] {
    return [...documents].sort((left, right) => {
      if (left.version !== right.version) {
        return right.version - left.version;
      }

      if (left.cid === right.cid) return 0;

      return left.cid < right.cid ? -1 : 1;
    });
  }

  private identityHeadKey(identityId: string): string {
    return `identity:${identityId}`;
  }

  private retainedRecords(identityId?: string): IdentityMetadataRecord[] {
    if (identityId) {
      return [...(this.candidatesByIdentityId.get(identityId)?.values() ?? [])];
    }

    return [...this.candidatesByIdentityId.values()].flatMap((candidates) => [
      ...candidates.values(),
    ]);
  }

  private async findCachedCandidateRecords(
    identityId?: string,
  ): Promise<IdentityMetadataRecord[]> {
    const projected = (
      await Promise.all(
        this.registry
          .findCachedHeadsByPrefix('identity:')
          .map((document) => this.verifiedRecord(document)),
      )
    ).filter(
      (document): document is IdentityMetadataRecord =>
        document !== undefined &&
        (!identityId || document.identityId === identityId),
    );

    return [...this.retainedRecords(identityId), ...projected];
  }

  private async verifiedRecord(
    document: Record<string, unknown>,
  ): Promise<IdentityMetadataRecord | undefined> {
    const record = this.toRecord(document);

    return record && (await this.hasCanonicalIdentity(record))
      ? record
      : undefined;
  }

  private async findHead(
    key: string,
  ): Promise<IdentityMetadataRecord | undefined> {
    const document = await this.registry.findHead(key);

    return document ? this.verifiedRecord(document) : undefined;
  }

  private async hasCanonicalIdentity(
    record: IdentityMetadataRecord,
  ): Promise<boolean> {
    try {
      const calculatedCid = await this.ipfsManager.calculateJSONId(
        this.mapper.toDocument(record.identity),
      );

      return calculatedCid.valueOf() === record.cid;
    } catch {
      return false;
    }
  }

  private retainCandidates(candidates: Map<string, IdentityMetadataRecord>) {
    const retained = this.sortByFreshness([...candidates.values()]).slice(
      0,
      OrbitDBIdentityMetadataIndex.MAX_CANDIDATES_PER_IDENTITY,
    );

    candidates.clear();
    retained.forEach((candidate) => candidates.set(candidate.cid, candidate));
  }

  private releaseHandle(identityId: string, handle: string): void {
    const claimants = this.claimantsByHandle.get(handle);

    claimants?.delete(identityId);

    if (claimants?.size === 0) {
      this.claimantsByHandle.delete(handle);
    }

    this.handlesByIdentityId.get(identityId)?.delete(handle);
  }

  private refreshHandleClaims(identityId: string): void {
    const claimed = new Set(
      this.retainedRecords(identityId)
        .map(({ handle }) => handle)
        .filter((handle): handle is string => handle !== undefined),
    );

    for (const handle of this.handlesByIdentityId.get(identityId) ?? []) {
      if (!claimed.has(handle)) {
        this.releaseHandle(identityId, handle);
      }
    }

    this.handlesByIdentityId.set(identityId, claimed);

    for (const handle of claimed) {
      const claimants = this.claimantsByHandle.get(handle) ?? new Set<string>();

      claimants.add(identityId);
      this.claimantsByHandle.set(handle, claimants);
    }
  }

  private claimantCandidates(handle: string): IdentityCandidate[] {
    return [...(this.claimantsByHandle.get(handle) ?? [])]
      .flatMap((identityId) => this.retainedRecords(identityId))
      .map((record) => this.toCandidate(record));
  }

  private async projectPersistedDocument(
    document: Record<string, unknown>,
    locallyVerified: boolean,
  ): Promise<void> {
    const record = this.toRecord(document);

    if (
      !record ||
      !(locallyVerified || (await this.hasCanonicalIdentity(record)))
    ) {
      return;
    }

    const candidates =
      this.candidatesByIdentityId.get(record.identityId) ??
      new Map<string, IdentityMetadataRecord>();

    this.candidatesByIdentityId.set(record.identityId, candidates);
    candidates.set(record.cid, record);
    this.retainCandidates(candidates);
    this.refreshHandleClaims(record.identityId);

    const retained = candidates.get(record.cid);

    if (retained) {
      this.registry.cacheHeadLocally(
        this.identityHeadKey(record.identityId),
        this.toStorageDocument(retained),
      );
    }
  }

  public async findAll(): Promise<IdentityMetadataRecord[]> {
    return this.deduplicateDocuments(await this.findCachedCandidateRecords());
  }

  public findAllCanonical(): Promise<IdentityMetadataRecord[]> {
    return Promise.resolve(this.deduplicateDocuments(this.retainedRecords()));
  }

  public findByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityMetadataRecord[]> {
    const owner = this.ownership.owner(
      this.claimantCandidates(handle.valueOf()),
      handle,
    );
    const record = owner
      ? this.retainedRecords(owner.getIdentity().toPrimitives().id).find(
          ({ cid }) => cid === owner.getExternalIdentifier().valueOf(),
        )
      : undefined;

    return Promise.resolve(record ? [record] : []);
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityMetadataRecord[]> {
    const head = await this.findHead(
      this.identityHeadKey(identityId.valueOf()),
    );
    const matchingHead =
      head?.identityId === identityId.valueOf() ? head : undefined;

    return this.deduplicateDocuments([
      ...(matchingHead ? [matchingHead] : []),
      ...(await this.findCachedCandidateRecords(identityId.valueOf())),
    ]);
  }

  public async findLatestByNetworkId(
    networkId: NetworkId,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = this.sortByFreshness(
      (await this.findCachedCandidateRecords()).filter((document) =>
        document.networkIds?.includes(networkId.valueOf()),
      ),
    );
    const latestDocuments = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      if (!latestDocuments.has(document.identityId)) {
        latestDocuments.set(document.identityId, document);
      }
    }

    return [...latestDocuments.values()];
  }

  public async save(
    identity: Identity,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const primitives = identity.toPrimitives();
    const record: IdentityMetadataRecord = {
      cid: externalIdentifier.valueOf(),
      handle: primitives.profile.handle,
      identity,
      identityId: primitives.id,
      networkIds: primitives.networks,
      previousCid: primitives.previousIdentityExternalIdentifier,
      version: primitives.version,
    };

    const document = this.toStorageDocument(record);

    await this.registry.putDocument('identities', document);
    await this.projectPersistedDocument(document, true);
  }

  public async projectDocument(
    document: Record<string, unknown>,
  ): Promise<void> {
    await this.projectPersistedDocument(document, false);
  }
}
