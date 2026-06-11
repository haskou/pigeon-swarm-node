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

  private async findPreviousIdentity(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity | undefined> {
    try {
      const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
        new IPFSId(externalIdentifier.valueOf()),
      );

      return this.mapper.toDomain(document);
    } catch {
      return undefined;
    }
  }

  private async shouldResolveMetadataCid(
    metadata: IdentityMetadataRecord,
  ): Promise<boolean> {
    if (await this.ipfsManager.hasConnectedPeers()) {
      return true;
    }

    try {
      const isAvailableLocally = await this.ipfsManager.stat(
        new IPFSId(metadata.cid),
        true,
        metadata.networkIds,
      );

      if (isAvailableLocally) {
        return true;
      }
    } catch {
      // Missing local content is valid metadata while the node is offline.
    }

    return false;
  }

  private async findCandidateFromCid(
    id: IdentityId,
    cid: IPFSId,
    shouldSaveMetadata: boolean = true,
  ): Promise<Identity | undefined> {
    try {
      const document =
        await this.ipfsManager.getJSON<IpfsIdentityDocument>(cid);
      const identity = this.mapper.toDomain(document);

      const isValid = await this.validator.isValidChainFor(
        id,
        identity,
        (externalIdentifier) => this.findPreviousIdentity(externalIdentifier),
      );

      if (!isValid) {
        await this.deleteMetadata(cid);

        return undefined;
      }

      if (shouldSaveMetadata) {
        await this.saveMetadata(identity, cid);
      }

      return identity;
    } catch {
      await this.deleteMetadata(cid);

      return undefined;
    }
  }

  private async findCandidateFromMetadata(
    metadata: IdentityMetadataRecord,
    shouldCheckAvailability: boolean = true,
  ): Promise<Identity | undefined> {
    if (
      shouldCheckAvailability &&
      !(await this.shouldResolveMetadataCid(metadata))
    ) {
      return undefined;
    }

    try {
      const id = new IdentityId(metadata.identityId);
      const cid = new IPFSId(metadata.cid);
      const document =
        await this.ipfsManager.getJSON<IpfsIdentityDocument>(cid);
      const candidate = this.mapper.toDomain(document);

      if (!this.validator.isValidFor(id, candidate)) {
        await this.deleteMetadata(cid);

        return undefined;
      }

      return candidate;
    } catch {
      await this.deleteMetadata(new IPFSId(metadata.cid));

      return undefined;
    }
  }

  private async findCandidateReferenceFromMetadata(
    metadata: IdentityMetadataRecord,
    shouldCheckAvailability: boolean = true,
  ): Promise<IdentityCandidate | undefined> {
    const identity = await this.findCandidateFromMetadata(
      metadata,
      shouldCheckAvailability,
    );

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
    for (const document of metadata) {
      const candidate = await this.findCandidateReferenceFromMetadata(document);

      if (candidate) {
        return candidate;
      }
    }

    return undefined;
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
    try {
      return await Promise.any(
        metadata.map((document) =>
          this.findCandidateReferenceFromMetadata(document, false).then(
            (candidate) => {
              if (candidate?.identity.hasHandle(handle)) {
                return candidate;
              }

              throw new IdentityNotFoundError(handle.valueOf());
            },
          ),
        ),
      );
    } catch {
      return undefined;
    }
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
    const candidate =
      await this.findFirstCandidateReferenceFromMetadata(metadata);

    if (candidate) {
      return [candidate];
    }

    const knownCids = new Set(metadata.map((document) => document.cid));

    if (metadata.length > 0 && !(await this.ipfsManager.hasConnectedPeers())) {
      throw new IdentityNotFoundError(id.valueOf());
    }

    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + id.valueOf(),
    );
    const candidates = await this.findCandidateReferencesFromCids(
      id,
      cidStrings,
      knownCids,
    );

    if (candidates.length === 0) {
      throw new IdentityNotFoundError(id.valueOf());
    }

    return candidates;
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
        const identityDocument =
          await this.ipfsManager.getJSON<IpfsIdentityDocument>(
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
