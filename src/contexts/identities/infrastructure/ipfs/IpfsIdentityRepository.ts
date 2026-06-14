import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { IdentityNotFoundError } from '../../domain/errors/IdentityNotFoundError';
import { Identity } from '../../domain/Identity';
import IdentityMetadataRepository from '../../domain/repositories/IdentityMetadataRepository';
import IdentityRepository from '../../domain/repositories/IdentityRepository';
import { IdentityCandidate } from '../../domain/repositories/types/IdentityCandidate';
import { IdentityMetadataRecord } from '../../domain/repositories/types/IdentityMetadataRecord';
import IdentityCandidateValidationDomainService from '../../domain/services/IdentityCandidateValidationDomainService';
import { IdentityExternalIdentifier } from '../../domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../domain/value-objects/ProfileHandle';
import { IpfsIdentityDocument } from './documents/IpfsIdentityDocument';
import IpfsIdentityMapper from './mappers/IpfsIdentityMapper';

export default class IpfsIdentityRepository extends IdentityRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';
  private readonly validator = new IdentityCandidateValidationDomainService();
  private readonly identityByCid = new Map<string, Identity>();
  private readonly activeRemoteCandidateRefreshes = new Set<string>();

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsIdentityMapper,
    private readonly metadataRepository: IdentityMetadataRepository,
  ) {
    super();
  }

  private async findValidMetadata(
    id: IdentityId,
  ): Promise<IdentityMetadataRecord[]> {
    try {
      return this.deduplicateMetadata(
        await this.metadataRepository.findByIdentityId(id),
      );
    } catch {
      return [];
    }
  }

  private deduplicateMetadata(
    documents: IdentityMetadataRecord[],
  ): IdentityMetadataRecord[] {
    const deduplicated = new Map<string, IdentityMetadataRecord>();

    for (const document of documents) {
      deduplicated.set(`${document.identityId}:${document.cid}`, document);
    }

    return [...deduplicated.values()].sort(
      (left, right) =>
        right.version - left.version || right.receivedAt - left.receivedAt,
    );
  }

  private async deleteMetadata(cid: IPFSId): Promise<void> {
    try {
      await this.metadataRepository.deleteByExternalIdentifier(
        new IdentityExternalIdentifier(cid.valueOf()),
      );
    } catch {
      return;
    }
  }

  private async saveMetadata(identity: Identity, cid: IPFSId): Promise<void> {
    try {
      await this.metadataRepository.save(
        identity,
        new IdentityExternalIdentifier(cid.valueOf()),
      );
    } catch {
      return;
    }
  }

  private async getDocumentFromCid(
    cid: IPFSId,
    networkIds?: string[],
  ): Promise<IpfsIdentityDocument> {
    try {
      return networkIds && networkIds.length > 0
        ? await this.ipfsManager.getJSONFromNetworks<IpfsIdentityDocument>(
            cid,
            networkIds,
          )
        : await this.ipfsManager.getJSON<IpfsIdentityDocument>(cid);
    } catch {
      const bytes =
        networkIds && networkIds.length > 0
          ? await this.ipfsManager.getBytesFromNetworks(cid, networkIds)
          : await this.ipfsManager.getBytes(cid);

      return JSON.parse(
        Buffer.from(bytes).toString('utf8'),
      ) as IpfsIdentityDocument;
    }
  }

  private async getIdentityFromCid(
    cid: IPFSId,
    networkIds?: string[],
  ): Promise<Identity> {
    const cached = this.identityByCid.get(cid.valueOf());

    if (cached) {
      return cached;
    }

    const document = await this.getDocumentFromCid(cid, networkIds);
    const identity = this.mapper.toDomain(document);

    this.identityByCid.set(cid.valueOf(), identity);

    return identity;
  }

  private async findPreviousIdentity(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity | undefined> {
    try {
      return await this.getIdentityFromCid(
        new IPFSId(externalIdentifier.valueOf()),
      );
    } catch {
      return undefined;
    }
  }

  private async findCandidateFromCid(
    id: IdentityId,
    cid: IPFSId,
    shouldSaveMetadata: boolean = true,
  ): Promise<Identity | undefined> {
    try {
      const identity = await this.getIdentityFromCid(cid);

      const isValid = await this.validator.isValidChainFor(
        id,
        identity,
        (externalIdentifier) => this.findPreviousIdentity(externalIdentifier),
      );

      if (!isValid) {
        this.identityByCid.delete(cid.valueOf());
        await this.deleteMetadata(cid);

        return undefined;
      }

      if (shouldSaveMetadata) {
        await this.saveMetadata(identity, cid);
      }

      return identity;
    } catch {
      return undefined;
    }
  }

  private async findCandidateFromMetadata(
    metadata: IdentityMetadataRecord,
  ): Promise<Identity | undefined> {
    try {
      const id = new IdentityId(metadata.identityId);
      const cid = new IPFSId(metadata.cid);
      const hasEmbeddedIdentity = metadata.identity !== undefined;
      const candidate =
        metadata.identity ||
        (await this.getIdentityFromCid(cid, metadata.networkIds));

      if (!this.validator.isValidFor(id, candidate)) {
        this.identityByCid.delete(cid.valueOf());
        await this.deleteMetadata(cid);

        return undefined;
      }

      if (!hasEmbeddedIdentity) {
        await this.saveMetadata(candidate, cid);
      }

      return candidate;
    } catch {
      this.identityByCid.delete(metadata.cid);

      return undefined;
    }
  }

  private async findCandidateReferenceFromMetadata(
    metadata: IdentityMetadataRecord,
  ): Promise<IdentityCandidate | undefined> {
    const identity = await this.findCandidateFromMetadata(metadata);

    if (!identity) {
      return undefined;
    }

    return {
      externalIdentifier: new IdentityExternalIdentifier(metadata.cid),
      identity,
    };
  }

  private async findFirstCandidateReferenceFromMetadata(
    metadata: IdentityMetadataRecord[],
  ): Promise<IdentityCandidate | undefined> {
    const [latestDocument] = metadata;

    return latestDocument
      ? this.findCandidateReferenceFromMetadata(latestDocument)
      : undefined;
  }

  private sortCandidateReferencesByFreshness(
    candidates: IdentityCandidate[],
  ): IdentityCandidate[] {
    return [...candidates].sort((left, right) => {
      if (left.identity.isNewerThan(right.identity)) {
        return -1;
      }

      if (right.identity.isNewerThan(left.identity)) {
        return 1;
      }

      return 0;
    });
  }

  private async findRemoteCandidateReferences(
    id: IdentityId,
    knownCids: Set<string>,
  ): Promise<IdentityCandidate[]> {
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + id.valueOf(),
    );

    return this.findCandidateReferencesFromCids(id, cidStrings, knownCids);
  }

  private async shouldUseOnlyLocalMetadata(
    metadata: IdentityMetadataRecord[],
  ): Promise<boolean> {
    return metadata.length > 0 && !(await this.ipfsManager.hasConnectedPeers());
  }

  private localCandidatesOrNotFound(
    id: IdentityId,
    candidates: IdentityCandidate[],
  ): IdentityCandidate[] {
    if (candidates.length > 0) {
      return candidates;
    }

    throw new IdentityNotFoundError(id.valueOf());
  }

  private async findRemoteCandidateReferencesOrFallback(
    id: IdentityId,
    knownCids: Set<string>,
    localCandidates: IdentityCandidate[],
  ): Promise<IdentityCandidate[]> {
    try {
      return await this.findRemoteCandidateReferences(id, knownCids);
    } catch (error) {
      if (localCandidates.length > 0) {
        return [];
      }

      throw error;
    }
  }

  private refreshRemoteCandidateReferencesInBackground(
    id: IdentityId,
    knownCids: Set<string>,
  ): void {
    const refreshKey = id.valueOf();

    if (this.activeRemoteCandidateRefreshes.has(refreshKey)) {
      return;
    }

    this.activeRemoteCandidateRefreshes.add(refreshKey);
    void this.refreshRemoteCandidateReferences(id, knownCids).finally(() => {
      this.activeRemoteCandidateRefreshes.delete(refreshKey);
    });
  }

  private async refreshRemoteCandidateReferences(
    id: IdentityId,
    knownCids: Set<string>,
  ): Promise<void> {
    try {
      if (!(await this.ipfsManager.hasConnectedPeers())) {
        return;
      }

      await this.findRemoteCandidateReferences(id, knownCids);
    } catch {
      return;
    }
  }

  private async findCandidateReferencesFromCids(
    id: IdentityId,
    cidStrings: string[],
    knownCids: Set<string>,
  ): Promise<IdentityCandidate[]> {
    const candidates = await Promise.all(
      cidStrings
        .filter((cidString) => !knownCids.has(cidString))
        .map(async (cidString) => {
          const candidate = await this.findCandidateFromCid(
            id,
            new IPFSId(cidString),
          );

          if (!candidate) {
            return undefined;
          }

          return {
            externalIdentifier: new IdentityExternalIdentifier(cidString),
            identity: candidate,
          };
        }),
    );

    return candidates.filter(
      (candidate): candidate is IdentityCandidate => candidate !== undefined,
    );
  }

  private async findFirstHandleCandidateFromMetadata(
    handle: ProfileHandle,
    metadata: IdentityMetadataRecord[],
  ): Promise<IdentityCandidate | undefined> {
    for (const document of metadata) {
      const candidate = await this.findCandidateReferenceFromMetadata(document);

      if (candidate?.identity.hasHandle(handle)) {
        return candidate;
      }
    }

    return undefined;
  }

  public async findById(id: IdentityId): Promise<Identity> {
    const candidates = await this.findCandidatesById(id);

    return candidates[0];
  }

  public async findByHandle(handle: ProfileHandle): Promise<Identity> {
    return (await this.findCandidateByHandle(handle)).identity;
  }

  public async findCandidateByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityCandidate> {
    const metadata = await this.metadataRepository.findByHandle(handle);
    const candidate = await this.findFirstHandleCandidateFromMetadata(
      handle,
      metadata,
    );

    if (candidate) {
      return candidate;
    }

    throw new IdentityNotFoundError(handle.valueOf());
  }

  public async findByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity | undefined> {
    const identity = await this.findPreviousIdentity(externalIdentifier);

    if (identity) {
      await this.saveMetadata(
        identity,
        new IPFSId(externalIdentifier.valueOf()),
      );
    }

    return identity;
  }

  public async findCandidateReferencesById(
    id: IdentityId,
  ): Promise<IdentityCandidate[]> {
    const metadata = await this.findValidMetadata(id);
    const localCandidate =
      await this.findFirstCandidateReferenceFromMetadata(metadata);
    const localCandidates = localCandidate ? [localCandidate] : [];
    const knownCids = new Set(metadata.map((document) => document.cid));

    if (localCandidates.length > 0) {
      this.refreshRemoteCandidateReferencesInBackground(id, knownCids);

      return this.sortCandidateReferencesByFreshness(localCandidates);
    }

    if (await this.shouldUseOnlyLocalMetadata(metadata)) {
      return this.localCandidatesOrNotFound(id, localCandidates);
    }

    const remoteCandidates = await this.findRemoteCandidateReferencesOrFallback(
      id,
      knownCids,
      localCandidates,
    );
    const candidates = this.sortCandidateReferencesByFreshness([
      ...localCandidates,
      ...remoteCandidates,
    ]);

    return this.localCandidatesOrNotFound(id, candidates);
  }

  public async findCandidatesById(id: IdentityId): Promise<Identity[]> {
    const candidates = await this.findCandidateReferencesById(id);

    return candidates.map((candidate) => candidate.identity);
  }

  public async save(identity: Identity): Promise<IdentityExternalIdentifier> {
    const document = this.mapper.toDocument(identity);
    const networks: string[] = document.networks;
    const cid = await this.ipfsManager.addJSONToNetworks(document, networks);

    await this.saveMetadata(identity, cid);
    this.identityByCid.set(cid.valueOf(), identity);

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      networks,
    );

    return new IdentityExternalIdentifier(cid.valueOf());
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    const metadata = await this.metadataRepository.findAll();
    const uniqueDocuments = new Map<string, IdentityMetadataRecord>();

    for (const document of metadata) {
      uniqueDocuments.set(`${document.identityId}:${document.cid}`, document);
    }

    let republished = 0;

    for (const document of uniqueDocuments.values()) {
      try {
        const identityDocument = await this.getDocumentFromCid(
          new IPFSId(String(document.cid)),
        );
        const cid = await this.ipfsManager.addJSONToNetworks(
          identityDocument,
          identityDocument.networks,
        );
        const identity = this.mapper.toDomain(identityDocument);

        await this.saveMetadata(identity, cid);
        await this.ipfsManager.putRecordToNetworks(
          this.ROUTING_KEY_PREFIX + document.identityId,
          cid.valueOf(),
          identityDocument.networks,
        );
        republished++;
      } catch {
        continue;
      }
    }

    return republished;
  }
}
