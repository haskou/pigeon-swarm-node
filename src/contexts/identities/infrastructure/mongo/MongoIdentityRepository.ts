import { ObjectId } from 'mongodb';
import { IdentityRepository } from '../../domain/repositories/IdentityRepository';
import { IdentityId } from '@app/contexts/shared/domain/IdentityId';
import { Identity } from '../../domain/Identity';
import { IdentityDocument } from './documents/IdentityDocument';
import MongoIdentityMapper from './mappers/MongoIdentityMapper';
import Database from '@app/shared/infrastructure/persistence/Database';
import { NullObject } from '@haskou/value-objects';

export default class MongoIdentityRepository implements IdentityRepository {
  private readonly collectionName = 'identities';

  constructor(
    private readonly database: Database,
    private readonly mapper: MongoIdentityMapper,
  ) {}

  public async findById(id: IdentityId): Promise<Identity> {
    const db = await this.database.globalDataSource();
    const document = await db
      ?.collection(this.collectionName)
      .findOne<IdentityDocument>({
        _id: new ObjectId(id.valueOf()),
        deleted: { $ne: true },
      });

    if (!document) {
      return NullObject.new(Identity);
    }

    return this.mapper.toDomain(document);
  }

  public async save(identity: Identity): Promise<void> {
    const db = await this.database.globalDataSource();
    const document = this.mapper.toDocument(identity);

    await db
      ?.collection(this.collectionName)
      .updateOne(
        { _id: new ObjectId(document._id) },
        { $set: document },
        { upsert: true },
      );
  }
}
