import { Call } from '@app/contexts/calls/domain/Call';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoCallDocument } from './documents/MongoCallDocument';

export class MongoCallRepository {
  private static readonly COLLECTION = 'calls';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoCallDocument>(
      MongoCallRepository.COLLECTION,
    );
  }

  private toDocument(call: Call): MongoCallDocument {
    const primitives = call.toPrimitives();

    return {
      _id: primitives.id,
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      scope: primitives.scope,
      status: primitives.status,
    };
  }

  private toDomain(document: MongoCallDocument): Call {
    return Call.fromPrimitives({
      createdAt: document.createdAt,
      creatorIdentityId: document.creatorIdentityId,
      endedAt: document.endedAt,
      id: document._id,
      networkId: document.networkId,
      participantIds: document.participantIds,
      scope: document.scope,
      status: document.status,
    });
  }

  public async findById(id: CallId): Promise<Call | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: id.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        participantIds: participantId.valueOf(),
        status: 'active',
      })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(call: Call): Promise<void> {
    const document = this.toDocument(call);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
