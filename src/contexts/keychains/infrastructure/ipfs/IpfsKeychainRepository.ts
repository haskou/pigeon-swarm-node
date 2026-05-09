import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { KeychainRepository } from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import MongoKeychainMetadataRepository from '../mongo/MongoKeychainMetadataRepository';
import { IpfsKeychainDocument } from './documents/IpfsKeychainDocument';
import IpfsKeychainMapper from './mappers/IpfsKeychainMapper';

export default class IpfsKeychainRepository implements KeychainRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_keychain-';

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

  public async findByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain | undefined> {
    return this.findCandidateFromCid(new IPFSId(externalIdentifier.valueOf()));
  }

  public async findCandidatesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<Keychain[]> {
    const metadata =
      await this.metadataRepository.findByOwnerIdentityId(ownerIdentityId);
    const knownCids = new Set(metadata.map((document) => document.cid));
    const candidates: Keychain[] = [];

    for (const document of metadata) {
      const candidate = await this.findCandidateFromCid(
        new IPFSId(document.cid),
      );

      if (candidate) {
        candidates.push(candidate);
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
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  public async save(keychain: Keychain): Promise<KeychainExternalIdentifier> {
    const document = this.mapper.toDocument(keychain);
    const cid = await this.ipfsManager.addJSONToAll(document);

    await this.metadataRepository.save(keychain, cid);
    await this.ipfsManager.putRecordToAll(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
    );

    return new KeychainExternalIdentifier(cid.valueOf());
  }
}
