import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { Notification } from '../../domain/Notification';
import { NotificationRepository } from '../../domain/repositories/NotificationRepository';
import { NotificationId } from '../../domain/value-objects/NotificationId';
import { MongoNotificationDocument } from './documents/MongoNotificationDocument';
import MongoNotificationMapper from './mappers/MongoNotificationMapper';

type Repository = NotificationRepository;

export default class MongoNotificationRepository implements Repository {
  private static readonly COLLECTION = 'notifications';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoNotificationMapper,
  ) {}

  private async collection() {
    return this.mongo.getCollection<MongoNotificationDocument>(
      MongoNotificationRepository.COLLECTION,
    );
  }

  public async findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: notificationId.valueOf(),
    });

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]> {
    const collection = await this.collection();
    const beforeDocument = beforeNotificationId
      ? await collection.findOne({ _id: beforeNotificationId.valueOf() })
      : undefined;
    const documents = await collection
      .find({
        ...(beforeDocument
          ? { createdAt: { $lt: beforeDocument.createdAt } }
          : {}),
        recipientIdentityId: recipientIdentityId.valueOf(),
      })
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((document) => this.mapper.toDomain(document));
  }

  public async save(notification: Notification): Promise<void> {
    const document = this.mapper.toDocument(notification);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
