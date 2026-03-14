import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/IPFSId';

import { Identity } from '../../domain/Identity';
import { IdentityRepository } from '../../domain/repositories/IdentityRepository';
import { IpfsIdentityDocument } from './documents/IpfsIdentityDocument';
import IpfsIdentityMapper from './mappers/IpfsIdentityMapper';

export default class IpfsIdentityRepository implements IdentityRepository {
  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsIdentityMapper,
  ) {}

  public async findById(id: IdentityId): Promise<Identity> {
    const cidString = await this.ipfsManager.getRecord(id.valueOf());

    if (!cidString) {
      // TODO: Replace with error
      throw new Error(`Identity with id ${id.valueOf()} not found`);
    }

    const document = await this.ipfsManager.getJSON<IpfsIdentityDocument>(
      new IPFSId(cidString),
    );

    return this.mapper.toDomain(document);
  }

  public async save(identity: Identity): Promise<void> {
    const document = this.mapper.toDocument(identity);
    const cid = await this.ipfsManager.addJSONToAll(document);

    await this.ipfsManager.putRecordToAll(document._id, cid.valueOf());
  }
}
