import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Notification } from '../../domain/Notification';
import NotificationRepository from '../../domain/repositories/NotificationRepository';
import { NotificationId } from '../../domain/value-objects/NotificationId';
import { OrbitDBNotificationDocument } from './documents/OrbitDBNotificationDocument';
import OrbitDBNotificationMapper from './mappers/OrbitDBNotificationMapper';

// eslint-disable-next-line max-len
export default class OrbitDBNotificationRepository extends NotificationRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBNotificationMapper,
  ) {
    super();
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private isPayload(
    value: unknown,
  ): value is OrbitDBNotificationDocument['payload'] {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private documentFromRecord(
    record: Record<string, unknown>,
  ): OrbitDBNotificationDocument | undefined {
    const createdAt = this.numberValue(record, 'createdAt');
    const id = this.stringValue(record, 'id');
    const payload = record.payload;
    const recipientIdentityId = this.stringValue(record, 'recipientIdentityId');
    const state = this.stringValue(record, 'state');
    const status = this.stringValue(record, 'status');
    const type = this.stringValue(record, 'type');

    if (
      !createdAt ||
      !id ||
      !this.isPayload(payload) ||
      !recipientIdentityId ||
      !state ||
      !status ||
      !type
    ) {
      return undefined;
    }

    return {
      createdAt,
      id,
      payload,
      recipientIdentityId,
      state: state as OrbitDBNotificationDocument['state'],
      status: status as OrbitDBNotificationDocument['status'],
      type: type as OrbitDBNotificationDocument['type'],
    };
  }

  private deduplicateDocuments(
    documents: OrbitDBNotificationDocument[],
  ): OrbitDBNotificationDocument[] {
    const deduplicated = new Map<string, OrbitDBNotificationDocument>();

    for (const document of documents) {
      deduplicated.set(document.id, document);
    }

    return [...deduplicated.values()];
  }

  private headKey(notificationId: string): string {
    return `notification:${notificationId}`;
  }

  private recipientHeadPrefix(recipientIdentityId: string): string {
    return `notification-recipient:${recipientIdentityId}:`;
  }

  private recipientHeadKey(document: OrbitDBNotificationDocument): string {
    return `${this.recipientHeadPrefix(document.recipientIdentityId)}${document.createdAt}:${document.id}`;
  }

  private async putHeads(document: OrbitDBNotificationDocument): Promise<void> {
    await Promise.all([
      this.registry.putHead(this.headKey(document.id), { ...document }),
      this.registry.putHead(this.recipientHeadKey(document), { ...document }),
    ]);
  }

  private async findHead(
    notificationId: NotificationId,
  ): Promise<OrbitDBNotificationDocument | undefined> {
    const document = await this.registry.findHead(
      this.headKey(notificationId.valueOf()),
    );

    return document ? this.documentFromRecord(document) : undefined;
  }

  private async findRecipientIndexedDocuments(
    recipientIdentityId: IdentityId,
  ): Promise<OrbitDBNotificationDocument[]> {
    const documents = await this.registry.findHeadsByPrefix(
      this.recipientHeadPrefix(recipientIdentityId.valueOf()),
    );

    return documents
      .map((document) => this.documentFromRecord(document))
      .filter(
        (document): document is OrbitDBNotificationDocument =>
          document !== undefined,
      );
  }

  private async findDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<OrbitDBNotificationDocument[]> {
    const documents = await this.registry.queryDocuments(
      'notifications',
      matcher,
    );

    return documents
      .map((document) => this.documentFromRecord(document))
      .filter(
        (document): document is OrbitDBNotificationDocument =>
          document !== undefined,
      );
  }

  public async findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined> {
    const head = await this.findHead(notificationId);

    if (head) {
      return this.mapper.toDomain(head);
    }

    const [document] = await this.findDocuments(
      (candidate) =>
        this.stringValue(candidate, 'id') === notificationId.valueOf(),
    );

    if (!document) {
      return undefined;
    }

    await this.putHeads(document);

    return this.mapper.toDomain(document);
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]> {
    const indexedDocuments =
      await this.findRecipientIndexedDocuments(recipientIdentityId);
    const documents =
      indexedDocuments.length > 0
        ? indexedDocuments
        : await this.findDocuments(
            (candidate) =>
              this.stringValue(candidate, 'recipientIdentityId') ===
              recipientIdentityId.valueOf(),
          );
    const beforeNotification = beforeNotificationId
      ? await this.findById(beforeNotificationId)
      : undefined;
    const beforeDocument = beforeNotification
      ? this.mapper.toDocument(beforeNotification)
      : undefined;

    if (indexedDocuments.length === 0) {
      await Promise.all(documents.map((document) => this.putHeads(document)));
    }

    return this.deduplicateDocuments(documents)
      .filter((document) =>
        beforeDocument ? document.createdAt < beforeDocument.createdAt : true,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map((document) => this.mapper.toDomain(document));
  }

  public async save(notification: Notification): Promise<void> {
    const document = this.mapper.toDocument(notification);

    await this.registry.putDocument('notifications', {
      ...document,
    });
    await this.putHeads(document);
  }
}
