import { IpfsIdentityDocument } from '@app/contexts/identities/infrastructure/ipfs/documents/IpfsIdentityDocument';
import { KeychainOwnerNetworksNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainOwnerNetworksNotFoundError';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainMetadataRepository from '@app/contexts/keychains/domain/repositories/KeychainMetadataRepository';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainCandidate } from '@app/contexts/keychains/domain/repositories/types/KeychainCandidate';
import { KeychainMetadataRecord } from '@app/contexts/keychains/domain/repositories/types/KeychainMetadataRecord';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { IpfsKeychainDocument } from './documents/IpfsKeychainDocument';
import IpfsKeychainMapper from './mappers/IpfsKeychainMapper';

export default class IpfsKeychainRepository extends KeychainRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_keychain-';
  private readonly IDENTITY_ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsKeychainMapper,
    private readonly metadataRepository: KeychainMetadataRepository,
  ) {
    super();
  }

  private async findCandidateFromCid(
    cid: IPFSId,
    shouldSaveMetadata: boolean = true,
  ): Promise<Keychain | undefined> {
    try {
      const document =
        await this.ipfsManager.getJSON<IpfsKeychainDocument>(cid);
      const keychain = this.mapper.toDomain(document);

      if (shouldSaveMetadata) {
        await this.metadataRepository.save(
          keychain,
          new KeychainExternalIdentifier(cid.valueOf()),
        );
      }

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
      throw new KeychainOwnerNetworksNotFoundError();
    }

    return this.ipfsManager.addJSONToNetworks(document, networkIds);
  }

  private async putRecordToOwnerNetworks(
    ownerIdentityId: string,
    cid: IPFSId,
  ): Promise<void> {
    const networkIds = await this.findOwnerNetworkIds(ownerIdentityId);

    if (networkIds.length === 0) {
      throw new KeychainOwnerNetworksNotFoundError();
    }

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + ownerIdentityId,
      cid.valueOf(),
      networkIds,
    );
  }

  private async shouldResolveMetadataCid(
    metadata: KeychainMetadataRecord,
  ): Promise<boolean> {
    if (await this.ipfsManager.hasConnectedPeers()) {
      return true;
    }

    try {
      const isAvailableLocally = await this.ipfsManager.stat(
        new IPFSId(metadata.cid),
        true,
      );

      if (isAvailableLocally) {
        return true;
      }
    } catch {
      // Missing local content is valid metadata while the node is offline.
    }

    return false;
  }

  private async findCandidateReferenceFromMetadata(
    metadata: KeychainMetadataRecord,
  ): Promise<KeychainCandidate | undefined> {
    if (!(await this.shouldResolveMetadataCid(metadata))) {
      return undefined;
    }

    const candidate = await this.findCandidateFromCid(
      new IPFSId(metadata.cid),
      false,
    );

    if (!candidate) {
      return undefined;
    }

    return {
      externalIdentifier: new KeychainExternalIdentifier(metadata.cid),
      keychain: candidate,
      source: 'local',
    };
  }

  private async findLocalCandidateReferences(
    metadata: KeychainMetadataRecord[],
  ): Promise<KeychainCandidate[]> {
    for (const document of metadata) {
      const candidate = await this.findCandidateReferenceFromMetadata(document);

      if (candidate) {
        return [candidate];
      }
    }

    return [];
  }

  private deduplicateMetadata(
    documents: KeychainMetadataRecord[],
  ): KeychainMetadataRecord[] {
    const deduplicated = new Map<string, KeychainMetadataRecord>();

    for (const document of documents) {
      deduplicated.set(`${document.ownerIdentityId}:${document.cid}`, document);
    }

    return [...deduplicated.values()].sort(
      (left, right) =>
        right.version - left.version || right.receivedAt - left.receivedAt,
    );
  }

  private async findRemoteCandidateReferences(
    ownerIdentityId: IdentityId,
    knownCids: Set<string>,
  ): Promise<KeychainCandidate[]> {
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + ownerIdentityId.valueOf(),
    );
    const candidates = await Promise.all(
      cidStrings
        .filter((cidString) => !knownCids.has(cidString))
        .map(async (cidString) => {
          const candidate = await this.findCandidateFromCid(
            new IPFSId(cidString),
          );

          if (!candidate) {
            return undefined;
          }

          const candidateReference: KeychainCandidate = {
            externalIdentifier: new KeychainExternalIdentifier(cidString),
            keychain: candidate,
            source: 'remote',
          };

          return candidateReference;
        }),
    );

    return candidates.filter(
      (candidate): candidate is KeychainCandidate => candidate !== undefined,
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
    const metadata = this.deduplicateMetadata(
      await this.metadataRepository.findByOwnerIdentityId(ownerIdentityId),
    );
    const localCandidates = await this.findLocalCandidateReferences(metadata);

    if (localCandidates.length > 0) {
      return localCandidates;
    }

    if (!(await this.ipfsManager.hasConnectedPeers())) {
      return [];
    }

    return this.findRemoteCandidateReferences(
      ownerIdentityId,
      new Set(metadata.map((document) => document.cid)),
    );
  }

  public async save(
    keychain: Keychain,
    networkIds: NetworkId[],
  ): Promise<KeychainExternalIdentifier> {
    const document = this.mapper.toDocument(keychain);
    const primitiveNetworkIds = networkIds.map((networkId) =>
      networkId.valueOf(),
    );
    const cid = await this.ipfsManager.addJSONToNetworks(
      document,
      primitiveNetworkIds,
    );

    await this.metadataRepository.save(
      keychain,
      new KeychainExternalIdentifier(cid.valueOf()),
    );
    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      primitiveNetworkIds,
    );

    return new KeychainExternalIdentifier(cid.valueOf());
  }

  public async republishLocalRoutingRecords(): Promise<number> {
    const metadata = await this.metadataRepository.findAll();
    const uniqueDocuments = new Map<string, KeychainMetadataRecord>();

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
