import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import HeliaIPFS from '@app/contexts/shared/infrastructure/helia-ipfs/HeliaIPFS';
import { IPFSId } from '@app/contexts/shared/infrastructure/helia-ipfs/IPFSId';

import { Identity } from '../../domain/Identity';
import { IdentityRepository } from '../../domain/repositories/IdentityRepository';
import { HeliaIdentityDocument } from './documents/HeliaIdentityDocument';
import HeliaIdentityMapper from './mappers/HeliaIdentityMapper';

export default class HeliaIdentityRepository implements IdentityRepository {
  constructor(
    private readonly ipfs: HeliaIPFS,
    private readonly mapper: HeliaIdentityMapper,
  ) {}

  public async findById(id: IdentityId): Promise<Identity> {
    const connection = await this.ipfs.getConnection();
    const cidString = await connection.getByKeyRecord(id.valueOf());

    if (!cidString) {
      // TODO: Replace with domain error
      throw new Error(`Identity with id ${id.valueOf()} not found`);
    }

    const document = await connection.getJSON<HeliaIdentityDocument>(
      new IPFSId(cidString),
    );

    return this.mapper.toDomain(document);
  }

  public async save(identity: Identity): Promise<void> {
    const connection = await this.ipfs.getConnection();
    const document = this.mapper.toDocument(identity);
    const cid = await connection.addJSON(document);

    await connection.putByKeyRecord(document._id, cid.valueOf());
  }
}
