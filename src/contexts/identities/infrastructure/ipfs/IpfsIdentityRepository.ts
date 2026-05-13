import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { IdentityNotFoundError } from '../../domain/errors/IdentityNotFoundError';
import { Identity } from '../../domain/Identity';
import {
  IdentityCandidate,
  IdentityRepository,
} from '../../domain/repositories/IdentityRepository';
import { IdentityCandidateValidationDomainService } from '../../domain/services/IdentityCandidateValidationDomainService';
import { IdentityExternalIdentifier } from '../../domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../domain/value-objects/ProfileHandle';
import { MongoIdentityMetadataDocument } from '../mongo/documents/MongoIdentityMetadataDocument';
import MongoIdentityMetadataRepository from '../mongo/MongoIdentityMetadataRepository';
import { IpfsIdentityDocument } from './documents/IpfsIdentityDocument';
import IpfsIdentityMapper from './mappers/IpfsIdentityMapper';

export default class IpfsIdentityRepository implements IdentityRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';
  private readonly validator = new IdentityCandidateValidationDomainService();

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsIdentityMapper,
    private readonly metadataRepository: MongoIdentityMetadataRepository,
  ) {}

  private async findValidMetadata(
    id: IdentityId,
  ): Promise<MongoIdentityMetadataDocument[]> {
    try {
      return await this.metadataRepository.findByIdentityId(id);
    } catch {
      return [];
    }
  }

  private async deleteMetadata(cid: IPFSId): Promise<void> {
    try {
      await this.metadataRepository.deleteByExternalIdentifier(cid);
    } catch {
      return;
    }
  }

  private async saveMetadata(identity: Identity, cid: IPFSId): Promise<void> {
    try {
      await this.metadataRepository.save(identity, cid);
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

  private async findCandidatesFromMetadata(
    id: IdentityId,
    metadata: MongoIdentityMetadataDocument[],
  ): Promise<Identity[]> {
    const cids = [...new Set(metadata.map((document) => document.cid))];
    const candidates: Identity[] = [];

    for (const cid of cids) {
      try {
        const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
          new IPFSId(cid),
        );

        const candidate = this.mapper.toDomain(document);

        const isValid = await this.validator.isValidChainFor(
          id,
          candidate,
          (externalIdentifier) => this.findPreviousIdentity(externalIdentifier),
        );

        if (!isValid) {
          await this.deleteMetadata(new IPFSId(cid));
          continue;
        }

        candidates.push(candidate);
      } catch {
        await this.deleteMetadata(new IPFSId(cid));
      }
    }

    return candidates;
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
    metadata: MongoIdentityMetadataDocument,
  ): Promise<Identity | undefined> {
    return this.findCandidateFromCid(
      new IdentityId(metadata.identityId),
      new IPFSId(metadata.cid),
    );
  }

  public async findById(id: IdentityId): Promise<Identity> {
    const candidates = await this.findCandidatesById(id);

    return candidates[0];
  }

  public async findByHandle(handle: ProfileHandle): Promise<Identity> {
    const metadata = await this.metadataRepository.findByHandle(handle);

    for (const document of metadata) {
      const candidate = await this.findCandidateFromMetadata(document);

      if (candidate?.toPrimitives().profile.handle === handle.valueOf()) {
        return candidate;
      }
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
    const candidates: IdentityCandidate[] = [];

    for (const document of metadata) {
      const candidate = await this.findCandidateFromCid(
        id,
        new IPFSId(document.cid),
        false,
      );

      if (candidate) {
        candidates.push({
          externalIdentifier: new IdentityExternalIdentifier(document.cid),
          identity: candidate,
        });
      }
    }

    const knownCids = new Set(metadata.map((document) => document.cid));
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + id.valueOf(),
    );

    for (const cidString of cidStrings) {
      if (knownCids.has(cidString)) {
        continue;
      }

      const candidate = await this.findCandidateFromCid(
        id,
        new IPFSId(cidString),
      );

      if (candidate) {
        candidates.push({
          externalIdentifier: new IdentityExternalIdentifier(cidString),
          identity: candidate,
        });
      }
    }

    if (candidates.length === 0) {
      throw new IdentityNotFoundError(id.valueOf());
    }

    return candidates;
  }

  public async findCandidatesById(id: IdentityId): Promise<Identity[]> {
    const candidates = await this.findCandidateReferencesById(id);

    return candidates.map((candidate) => candidate.identity);
  }

  public async save(identity: Identity): Promise<void> {
    const document = this.mapper.toDocument(identity);
    const networks: string[] = document.networks;
    const cid = await this.ipfsManager.addJSONToNetworks(document, networks);

    await this.saveMetadata(identity, cid);

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      networks,
    );
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    const metadata = await this.metadataRepository.findAll();
    const uniqueDocuments = new Map<string, MongoIdentityMetadataDocument>();

    for (const document of metadata) {
      uniqueDocuments.set(`${document.identityId}:${document.cid}`, document);
    }

    let republished = 0;

    for (const document of uniqueDocuments.values()) {
      try {
        const identityDocument =
          await this.ipfsManager.getJSON<IpfsIdentityDocument>(
            new IPFSId(document.cid),
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
