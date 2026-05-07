import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { IdentityNotFoundError } from '../../domain/errors/IdentityNotFoundError';
import { Identity } from '../../domain/Identity';
import { IdentityRepository } from '../../domain/repositories/IdentityRepository';
import { MongoIdentityMetadataDocument } from '../mongo/documents/MongoIdentityMetadataDocument';
import MongoIdentityMetadataRepository from '../mongo/MongoIdentityMetadataRepository';
import { IpfsIdentityDocument } from './documents/IpfsIdentityDocument';
import IpfsIdentityMapper from './mappers/IpfsIdentityMapper';

export default class IpfsIdentityRepository implements IdentityRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';
  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsIdentityMapper,
    private readonly metadataRepository: MongoIdentityMetadataRepository,
  ) {}

  private async findCandidatesFromMetadata(
    metadata: MongoIdentityMetadataDocument[],
  ): Promise<Identity[]> {
    const cids = [...new Set(metadata.map((document) => document.cid))];
    const candidates: Identity[] = [];

    for (const cid of cids) {
      try {
        const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
          new IPFSId(cid),
        );

        candidates.push(this.mapper.toDomain(document));
      } catch {
        await this.metadataRepository.markInvalid(new IPFSId(cid));
      }
    }

    return candidates;
  }

  public async findById(id: IdentityId): Promise<Identity> {
    const candidates = await this.findCandidatesById(id);

    return candidates[0];
  }

  public async findCandidatesById(id: IdentityId): Promise<Identity[]> {
    const metadata = await this.metadataRepository.findValidByIdentityId(id);

    if (metadata.length > 0) {
      const candidates = await this.findCandidatesFromMetadata(metadata);

      if (candidates.length > 0) {
        return candidates;
      }
    }

    const cidString = await this.ipfsManager.getRecord(
      this.ROUTING_KEY_PREFIX + id.valueOf(),
    );

    if (!cidString) {
      throw new IdentityNotFoundError(id.valueOf());
    }

    const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
      new IPFSId(cidString),
    );
    const identity = this.mapper.toDomain(document);

    await this.metadataRepository.save(identity, new IPFSId(cidString), true);

    return [identity];
  }

  public async save(identity: Identity): Promise<void> {
    const document = this.mapper.toDocument(identity);
    const networks: string[] = document.networks;
    const cid = await this.ipfsManager.addJSONToNetworks(document, networks);

    await this.metadataRepository.save(identity, cid, true);

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      networks,
    );
  }
}
