import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
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

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private documentFromReplicatedDocument(
    document: Record<string, unknown>,
  ): MongoNotificationDocument | undefined {
    const id = this.stringValue(document, 'id');
    const createdAt = this.numberValue(document, 'createdAt');
    const payload = document.payload;
    const recipientIdentityId = this.stringValue(
      document,
      'recipientIdentityId',
    );
    const state = this.stringValue(document, 'state');
    const status = this.stringValue(document, 'status');
    const type = this.stringValue(document, 'type');

    if (
      !id ||
      !createdAt ||
      !this.isRecord(payload) ||
      !recipientIdentityId ||
      !state ||
      !status ||
      !type
    ) {
      return undefined;
    }

    return {
      _id: id,
      createdAt,
      payload: payload as MongoNotificationDocument['payload'],
      recipientIdentityId,
      state: state as MongoNotificationDocument['state'],
      status: status as MongoNotificationDocument['status'],
      type: type as MongoNotificationDocument['type'],
    };
  }

  private async findReplicatedDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<MongoNotificationDocument[]> {
    try {
      const documents =
        await OrbitDBReplicatedStateRegistry.shared().queryDocuments(
          'notifications',
          matcher,
        );

      return documents
        .map((document) => this.documentFromReplicatedDocument(document))
        .filter(
          (document): document is MongoNotificationDocument =>
            document !== undefined,
        );
    } catch {
      return [];
    }
  }

  private deduplicateDocuments(
    documents: MongoNotificationDocument[],
  ): MongoNotificationDocument[] {
    const deduplicated = new Map<string, MongoNotificationDocument>();

    for (const document of documents) {
      deduplicated.set(document._id, document);
    }

    return [...deduplicated.values()];
  }

  public async findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: notificationId.valueOf(),
    });

    if (document) {
      return this.mapper.toDomain(document);
    }

    const [replicatedDocument] = await this.findReplicatedDocuments(
      (candidate) =>
        this.stringValue(candidate, 'id') === notificationId.valueOf(),
    );

    return replicatedDocument
      ? this.mapper.toDomain(replicatedDocument)
      : undefined;
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
    const replicatedDocuments = await this.findReplicatedDocuments(
      (candidate) =>
        this.stringValue(candidate, 'recipientIdentityId') ===
        recipientIdentityId.valueOf(),
    );
    const replicatedBeforeDocument = beforeNotificationId
      ? replicatedDocuments.find(
          (document) => document._id === beforeNotificationId.valueOf(),
        )
      : undefined;
    const beforeCreatedAt =
      beforeDocument?.createdAt ?? replicatedBeforeDocument?.createdAt;
    const mergedDocuments = this.deduplicateDocuments([
      ...documents,
      ...replicatedDocuments.filter((document) =>
        beforeCreatedAt ? document.createdAt < beforeCreatedAt : true,
      ),
    ])
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit);

    return mergedDocuments.map((document) => this.mapper.toDomain(document));
  }

  public async save(notification: Notification): Promise<void> {
    const document = this.mapper.toDocument(notification);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
