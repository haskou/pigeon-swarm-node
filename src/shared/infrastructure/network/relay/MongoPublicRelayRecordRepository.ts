import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoPublicRelayRecordDocument } from './MongoPublicRelayRecordDocument';
import { PublicRelayRecordPrimitives } from './PublicRelayRecordPrimitives';

export class MongoPublicRelayRecordRepository {
  public static readonly COLLECTION = 'public_relay_records';

  public constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoPublicRelayRecordDocument>(
      MongoPublicRelayRecordRepository.COLLECTION,
    );
  }

  private toDocument(
    record: PublicRelayRecordPrimitives,
  ): MongoPublicRelayRecordDocument {
    return {
      _id: record.peerId,
      expiresAt: record.expiresAt,
      issuedAt: record.issuedAt,
      multiaddrs: record.multiaddrs,
      peerId: record.peerId,
      publicKey: record.publicKey,
      role: record.role,
      signature: record.signature,
      version: record.version,
    };
  }

  private toRecord(
    document: MongoPublicRelayRecordDocument,
  ): PublicRelayRecordPrimitives {
    return {
      expiresAt: document.expiresAt,
      issuedAt: document.issuedAt,
      multiaddrs: document.multiaddrs,
      peerId: document.peerId,
      publicKey: document.publicKey,
      role: document.role,
      signature: document.signature,
      version: document.version,
    };
  }

  public async save(record: PublicRelayRecordPrimitives): Promise<void> {
    const document = this.toDocument(record);
    const collection = await this.collection();

    await collection.updateOne(
      { _id: document._id },
      { $set: document },
      { upsert: true },
    );
  }

  public async findActive(
    now: number = Date.now(),
  ): Promise<PublicRelayRecordPrimitives[]> {
    const collection = await this.collection();
    const documents = await collection
      .find({ expiresAt: { $gt: now } })
      .sort({ expiresAt: -1 })
      .toArray();

    return documents.map((document) => this.toRecord(document));
  }

  public async deleteExpired(now: number = Date.now()): Promise<void> {
    const collection = await this.collection();

    await collection.deleteMany({
      expiresAt: { $lte: now },
    });
  }
}
