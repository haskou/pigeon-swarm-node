import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Timestamp } from '@haskou/value-objects';

import { IdentityPresence } from '../../domain/IdentityPresence';
import IdentityPresenceRepository from '../../domain/repositories/IdentityPresenceRepository';
import { PresenceStatus } from '../../domain/value-objects/PresenceStatus';
import { MongoIdentityPresenceDocument } from './documents/MongoIdentityPresenceDocument';

// eslint-disable-next-line max-len
export default class MongoIdentityPresenceRepository extends IdentityPresenceRepository {
  private static readonly COLLECTION = 'identity_presence';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoIdentityPresenceDocument>(
      MongoIdentityPresenceRepository.COLLECTION,
    );
  }

  private toDocument(
    presence: IdentityPresence,
  ): MongoIdentityPresenceDocument {
    const primitives = presence.toPrimitives();

    return {
      _id: primitives.identityId,
      customMessage: primitives.customMessage,
      identityId: primitives.identityId,
      lastActivityAt: primitives.lastActivityAt,
      lastHeartbeatAt: primitives.lastHeartbeatAt,
      status: primitives.status,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(document: MongoIdentityPresenceDocument): IdentityPresence {
    return IdentityPresence.fromPrimitives({
      customMessage: document.customMessage,
      identityId: document.identityId,
      lastActivityAt: document.lastActivityAt,
      lastHeartbeatAt: document.lastHeartbeatAt,
      status: PresenceStatus.fromPrimitives(document.status).valueOf(),
      updatedAt: document.updatedAt,
    });
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<IdentityPresence | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: identityId.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findByIdentityIds(
    identityIds: IdentityId[],
  ): Promise<IdentityPresence[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        _id: { $in: identityIds.map((identityId) => identityId.valueOf()) },
      })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async findPotentiallyExpired(
    threshold: Timestamp,
  ): Promise<IdentityPresence[]> {
    const documents = await (
      await this.collection()
    )
      .find({
        $or: [
          { lastHeartbeatAt: { $lte: threshold.valueOf() } },
          { status: { $in: ['available', 'away'] } },
        ],
      })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(presence: IdentityPresence): Promise<void> {
    const document = this.toDocument(presence);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
