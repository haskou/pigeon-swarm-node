import { IpfsIdentityDocument } from '@app/contexts/identities/infrastructure/ipfs/documents/IpfsIdentityDocument';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import {
  KeychainCandidate,
  KeychainRepository,
} from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { MongoKeychainMetadataDocument } from '../mongo/documents/MongoKeychainMetadataDocument';
import MongoKeychainMetadataRepository from '../mongo/MongoKeychainMetadataRepository';
import { IpfsKeychainDocument } from './documents/IpfsKeychainDocument';
import IpfsKeychainMapper from './mappers/IpfsKeychainMapper';

export default class IpfsKeychainRepository implements KeychainRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_keychain-';
  private readonly IDENTITY_ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsKeychainMapper,
    private readonly metadataRepository: MongoKeychainMetadataRepository,
  ) {}

  private async findCandidateFromCid(
    cid: IPFSId,
  ): Promise<Keychain | undefined> {
    try {
      const document =
        await this.ipfsManager.getJSON<IpfsKeychainDocument>(cid);
      const keychain = this.mapper.toDomain(document);

      await this.metadataRepository.save(keychain, cid);

      return keychain;
    } catch {
      return undefined;
    }
  }

  private async findOwnerNetworkIds(
    ownerIdentityId: string,
  ): Promise<string[]> {
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.IDENTITY_ROUTING_KEY_PREFIX + ownerIdentityId,
    );
    const networkIds = new Set<string>();

    for (const cidString of cidStrings) {
      try {
        const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
          new IPFSId(cidString),
        );

        document.networks.forEach((networkId) => networkIds.add(networkId));
      } catch {
        continue;
      }
    }

    return [...networkIds];
  }

  private async addJSONToOwnerNetworks(
    ownerIdentityId: string,
    document: IpfsKeychainDocument,
  ): Promise<IPFSId> {
    const networkIds = await this.findOwnerNetworkIds(ownerIdentityId);

    if (networkIds.length === 0) {
      return this.ipfsManager.addJSONToAll(document);
    }

    return this.ipfsManager.addJSONToNetworks(document, networkIds);
  }

  private async putRecordToOwnerNetworks(
    ownerIdentityId: string,
    cid: IPFSId,
  ): Promise<void> {
    const networkIds = await this.findOwnerNetworkIds(ownerIdentityId);

    if (networkIds.length === 0) {
      await this.ipfsManager.putRecordToAll(
        this.ROUTING_KEY_PREFIX + ownerIdentityId,
        cid.valueOf(),
      );

      return;
    }

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + ownerIdentityId,
      cid.valueOf(),
      networkIds,
    );
  }

  public async findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain | undefined> {
    return this.findCandidateFromCid(new IPFSId(externalIdentifier.valueOf()));
  }

  public async findCandidatesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<Keychain[]> {
    const candidates =
      await this.findCandidateReferencesByOwnerId(ownerIdentityId);

    return candidates.map((candidate) => candidate.keychain);
  }

  public async findCandidateReferencesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainCandidate[]> {
    const metadata =
      await this.metadataRepository.findByOwnerIdentityId(ownerIdentityId);
    const knownCids = new Set(metadata.map((document) => document.cid));
    const candidates: KeychainCandidate[] = [];

    for (const document of metadata) {
      const candidate = await this.findCandidateFromCid(
        new IPFSId(document.cid),
      );

      if (candidate) {
        candidates.push({
          externalIdentifier: new KeychainExternalIdentifier(document.cid),
          keychain: candidate,
        });
      }
    }

    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + ownerIdentityId.valueOf(),
    );

    for (const cidString of cidStrings) {
      if (knownCids.has(cidString)) {
        continue;
      }

      const candidate = await this.findCandidateFromCid(new IPFSId(cidString));

      if (candidate) {
        candidates.push({
          externalIdentifier: new KeychainExternalIdentifier(cidString),
          keychain: candidate,
        });
      }
    }

    return candidates;
  }

  public async save(keychain: Keychain): Promise<KeychainExternalIdentifier> {
    const document = this.mapper.toDocument(keychain);
    const cid = await this.addJSONToOwnerNetworks(document._id, document);

    await this.metadataRepository.save(keychain, cid);
    await this.putRecordToOwnerNetworks(document._id, cid);

    return new KeychainExternalIdentifier(cid.valueOf());
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    const metadata = await this.metadataRepository.findAll();
    const uniqueDocuments = new Map<string, MongoKeychainMetadataDocument>();

    for (const document of metadata) {
      uniqueDocuments.set(
        `${document.ownerIdentityId}:${document.cid}`,
        document,
      );
    }

    let republished = 0;

    for (const document of uniqueDocuments.values()) {
      try {
        const keychainDocument =
          await this.ipfsManager.getJSON<IpfsKeychainDocument>(
            new IPFSId(document.cid),
          );
        const cid = await this.addJSONToOwnerNetworks(
          document.ownerIdentityId,
          keychainDocument,
        );

        await this.putRecordToOwnerNetworks(document.ownerIdentityId, cid);
        republished++;
      } catch {
        continue;
      }
    }

    return republished;
  }
}
