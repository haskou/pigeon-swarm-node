import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { IdentityNotFoundError } from '../../domain/errors/IdentityNotFoundError';
import { Identity } from '../../domain/Identity';
import { IdentityRepository } from '../../domain/repositories/IdentityRepository';
import { IpfsIdentityDocument } from './documents/IpfsIdentityDocument';
import IpfsIdentityMapper from './mappers/IpfsIdentityMapper';

export default class IpfsIdentityRepository implements IdentityRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';
  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsIdentityMapper,
  ) {}

  public async findById(id: IdentityId): Promise<Identity> {
    const candidates = await this.findCandidatesById(id);

    return candidates[0];
  }

  public async findCandidatesById(id: IdentityId): Promise<Identity[]> {
    const cidString = await this.ipfsManager.getRecord(
      this.ROUTING_KEY_PREFIX + id.valueOf(),
    );

    if (!cidString) {
      throw new IdentityNotFoundError(id.valueOf());
    }

    const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
      new IPFSId(cidString),
    );

    return [this.mapper.toDomain(document)];
  }

  public async save(identity: Identity): Promise<void> {
    const document = this.mapper.toDocument(identity);
    const networks: string[] = document.networks;
    const cid = await this.ipfsManager.addJSONToNetworks(document, networks);

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      networks,
    );
  }
}
