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
  private readonly keychainByCid = new Map<string, Keychain>();

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsKeychainMapper,
    private readonly metadataRepository: KeychainMetadataRepository,
  ) {
    super();
  }

  private async getDocumentFromCid(cid: IPFSId): Promise<IpfsKeychainDocument> {
    try {
      const bytes = await this.ipfsManager.getBytes(cid);

      return JSON.parse(bytes.toString('utf8')) as IpfsKeychainDocument;
    } catch {
      return this.ipfsManager.getJSON<IpfsKeychainDocument>(cid);
    }
  }

  private async getKeychainFromCid(cid: IPFSId): Promise<Keychain> {
    const cached = this.keychainByCid.get(cid.valueOf());

    if (cached) {
      return cached;
    }

    const document = await this.getDocumentFromCid(cid);
    const keychain = this.mapper.toDomain(document);

    this.keychainByCid.set(cid.valueOf(), keychain);

    return keychain;
  }

  private async findCandidateFromCid(
    cid: IPFSId,
    shouldSaveMetadata: boolean = true,
  ): Promise<Keychain | undefined> {
    try {
      const keychain = await this.getKeychainFromCid(cid);

      if (shouldSaveMetadata) {
        await this.metadataRepository.save(
          keychain,
          new KeychainExternalIdentifier(cid.valueOf()),
        );
      }

      return keychain;
    } catch {
      this.keychainByCid.delete(cid.valueOf());

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

  private async findCandidateReferenceFromMetadata(
    metadata: KeychainMetadataRecord,
  ): Promise<KeychainCandidate | undefined> {
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
    const [latestDocument] = metadata;
    const candidate = latestDocument
      ? await this.findCandidateReferenceFromMetadata(latestDocument)
      : undefined;

    return candidate ? [candidate] : [];
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
    this.keychainByCid.set(cid.valueOf(), keychain);
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
        const keychainDocument = await this.getDocumentFromCid(
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
