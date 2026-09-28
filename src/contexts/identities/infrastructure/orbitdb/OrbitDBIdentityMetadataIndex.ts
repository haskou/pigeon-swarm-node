import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
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
  private static readonly MAX_CANDIDATES_PER_IDENTITY = 64;

  private readonly candidatesByIdentityId = new Map<
    string,
    Map<string, IdentityMetadataRecord>
  >();

  private readonly canonicalCandidatesByIdentityId = new Map<
    string,
    Map<string, IdentityMetadataRecord>
  >();

  private readonly mapper = new IpfsIdentityMapper();

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly ipfsManager: IPFS,
  ) {
    super();
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private identityIdFrom(
    document: Record<string, unknown>,
  ): string | undefined {
    const identityId = this.stringValue(document, 'identityId');
    const embeddedIdentityId = this.isRecord(document.identity)
      ? this.stringValue(document.identity, 'id')
      : undefined;
    const projectedIdentityId = this.isProjectedIdentityRecord(document)
      ? this.stringValue(document, 'id')
      : undefined;

    if (identityId && embeddedIdentityId && identityId !== embeddedIdentityId) {
      return undefined;
    }

    return identityId || embeddedIdentityId || projectedIdentityId;
  }

  private isProjectedIdentityRecord(
    document: Record<string, unknown>,
  ): boolean {
    return (
      Boolean(this.stringValue(document, 'cid')) &&
      Boolean(this.stringValue(document, 'id')) &&
      Boolean(this.stringValue(document, 'lastEventId'))
    );
  }

  private networkIdsFrom(
    document: Record<string, unknown>,
  ): string[] | undefined {
    const networkId = this.stringValue(document, 'networkId');

    if (this.isStringArray(document.networkIds)) {
      return document.networkIds;
    }

    return networkId ? [networkId] : undefined;
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
    const cid = this.stringValue(document, 'cid');
    const identity = this.identityFrom(document);
    const identityId = this.identityIdFrom(document);

    if (!cid || !identityId || document.deleted === true) {
      return undefined;
    }

    return {
      cid,
      handle: this.stringValue(document, 'handle'),
      identity,
      identityId,
      networkId: this.stringValue(document, 'networkId'),
      networkIds: this.networkIdsFrom(document),
      previousCid: this.stringValue(document, 'previousCid'),
      receivedAt: this.numberValue(document, 'receivedAt') || 0,
      version: this.numberValue(document, 'version') || 0,
    };
  }

  private toStorageDocument(
    record: IdentityMetadataRecord,
    deleted: boolean = false,
  ): OrbitDBIdentityMetadataDocument {
    return {
      cid: record.cid,
      deleted,
      handle: record.handle,
      id: record.identityId,
      identity: record.identity?.toPrimitives(),
      identityId: record.identityId,
      networkId: record.networkId,
      networkIds: record.networkIds,
      previousCid: record.previousCid,
      receivedAt: record.receivedAt,
      version: record.version,
    };
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
    return [...documents].sort(
      (left, right) =>
        right.version - left.version ||
        left.cid.localeCompare(right.cid) ||
        right.receivedAt - left.receivedAt,
    );
  }

  private identityHeadKey(identityId: string): string {
    return `identity:${identityId}`;
  }

  private handleHeadKey(handle: string): string {
    return `identity-handle:${handle}`;
  }

  private findCachedCandidateRecords(
    identityId?: string,
  ): IdentityMetadataRecord[] {
    if (identityId) {
      return [...(this.candidatesByIdentityId.get(identityId)?.values() ?? [])];
    }

    const retained = [...this.candidatesByIdentityId.values()].flatMap(
      (candidates) => [...candidates.values()],
    );
    const projected = this.registry
      .findCachedHeadsByPrefix('identity:')
      .map((document) => this.toRecord(document))
      .filter(
        (document): document is IdentityMetadataRecord =>
          document !== undefined,
      );

    return [...retained, ...projected];
  }

  private async findHead(
    key: string,
  ): Promise<IdentityMetadataRecord | undefined> {
    const document = await this.registry.findHead(key);

    return document ? this.toRecord(document) : undefined;
  }

  private async hasCanonicalEmbeddedIdentity(
    record: IdentityMetadataRecord,
  ): Promise<boolean> {
    if (!record.identity) {
      return false;
    }

    try {
      const calculatedCid = await this.ipfsManager.calculateJSONId(
        this.mapper.toDocument(record.identity),
      );

      return calculatedCid.valueOf() === record.cid;
    } catch {
      return false;
    }
  }

  private retainCandidates(
    candidates: Map<string, IdentityMetadataRecord>,
    canonicalCandidates: Map<string, IdentityMetadataRecord>,
  ): void {
    const ordered = this.sortByFreshness([...candidates.values()]);
    const canonical = this.sortByFreshness([...canonicalCandidates.values()]);
    const references = ordered.filter(
      ({ cid }) => !canonicalCandidates.has(cid),
    );
    const retained = [...canonical, ...references].slice(
      0,
      OrbitDBIdentityMetadataIndex.MAX_CANDIDATES_PER_IDENTITY,
    );
    const retainedCids = new Set(retained.map(({ cid }) => cid));

    candidates.clear();
    retained.forEach((candidate) => candidates.set(candidate.cid, candidate));
    [...canonicalCandidates.keys()]
      .filter((cid) => !retainedCids.has(cid))
      .forEach((cid) => canonicalCandidates.delete(cid));
  }

  private async addCandidate(
    candidates: Map<string, IdentityMetadataRecord>,
    canonicalCandidates: Map<string, IdentityMetadataRecord>,
    record: IdentityMetadataRecord,
    locallyVerified: boolean,
  ): Promise<boolean> {
    const canonical =
      locallyVerified || (await this.hasCanonicalEmbeddedIdentity(record));

    if (record.identity && !canonical) {
      return false;
    }

    if (!canonical && canonicalCandidates.has(record.cid)) {
      return false;
    }

    candidates.set(record.cid, record);

    if (canonical) {
      canonicalCandidates.set(record.cid, record);
    }

    return true;
  }

  private removeCandidate(
    candidates: Map<string, IdentityMetadataRecord>,
    canonicalCandidates: Map<string, IdentityMetadataRecord>,
    cid: string,
    locallyVerified: boolean,
  ): boolean {
    if (!locallyVerified) {
      return false;
    }

    candidates.delete(cid);
    canonicalCandidates.delete(cid);

    return true;
  }

  private async projectPersistedDocument(
    document: Record<string, unknown>,
    locallyVerified: boolean,
  ): Promise<void> {
    const cid = this.stringValue(document, 'cid');
    const identityId = this.identityIdFrom(document);

    if (!cid || !identityId) {
      return;
    }

    const candidates =
      this.candidatesByIdentityId.get(identityId) ??
      new Map<string, IdentityMetadataRecord>();
    const canonicalCandidates =
      this.canonicalCandidatesByIdentityId.get(identityId) ??
      new Map<string, IdentityMetadataRecord>();

    this.candidatesByIdentityId.set(identityId, candidates);
    this.canonicalCandidatesByIdentityId.set(identityId, canonicalCandidates);
    const record = this.toRecord(document);

    const accepted = record
      ? await this.addCandidate(
          candidates,
          canonicalCandidates,
          record,
          locallyVerified,
        )
      : this.removeCandidate(
          candidates,
          canonicalCandidates,
          cid,
          locallyVerified,
        );

    if (!accepted) return;

    this.retainCandidates(candidates, canonicalCandidates);
    this.registry.cacheHeadLocally(this.identityHeadKey(identityId), document);
  }

  private findCachedRecordsByHandle(handle: string): IdentityMetadataRecord[] {
    return this.findCachedCandidateRecords().filter(
      (document) => document.handle === handle,
    );
  }

  public findAll(): Promise<IdentityMetadataRecord[]> {
    return Promise.resolve(
      this.deduplicateDocuments(this.findCachedCandidateRecords()),
    );
  }

  public findAllCanonical(): Promise<IdentityMetadataRecord[]> {
    const canonical = [
      ...this.canonicalCandidatesByIdentityId.values(),
    ].flatMap((candidates) => [...candidates.values()]);

    return Promise.resolve(this.deduplicateDocuments(canonical));
  }

  public async findByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityMetadataRecord[]> {
    const key = this.handleHeadKey(handle.valueOf());
    const head = await this.findHead(key);

    return this.deduplicateDocuments([
      ...(head ? [head] : []),
      ...this.findCachedRecordsByHandle(handle.valueOf()),
    ]);
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityMetadataRecord[]> {
    const head = await this.findHead(
      this.identityHeadKey(identityId.valueOf()),
    );

    return this.deduplicateDocuments([
      ...(head ? [head] : []),
      ...this.findCachedCandidateRecords(identityId.valueOf()),
    ]);
  }

  public findLatestByNetworkId(
    networkId: NetworkId,
  ): Promise<IdentityMetadataRecord[]> {
    const documents = this.sortByFreshness([
      ...this.registry
        .findCachedHeadsByPrefix('identity:')
        .map((document) => this.toRecord(document))
        .filter(
          (document): document is IdentityMetadataRecord =>
            document !== undefined &&
            (document.networkIds?.includes(networkId.valueOf()) ||
              document.networkId === networkId.valueOf()),
        ),
    ]);
    const latestDocuments = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      if (!latestDocuments.has(document.identityId)) {
        latestDocuments.set(document.identityId, document);
      }
    }

    return Promise.resolve([...latestDocuments.values()]);
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
      receivedAt: Date.now(),
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

  public async deleteByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const documents = (await this.findAll()).filter(
      (document) => document.cid === externalIdentifier.valueOf(),
    );

    await Promise.all(
      documents.map(async (document) => {
        const tombstone = this.toStorageDocument(document, true);

        await this.registry.putDocument('identities', tombstone);
        await this.projectPersistedDocument(tombstone, true);
      }),
    );
  }
}
