import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Notification } from '../../domain/Notification';
import NotificationRepository from '../../domain/repositories/NotificationRepository';
import { NotificationId } from '../../domain/value-objects/NotificationId';
import { OrbitDBNotificationDocument } from './documents/OrbitDBNotificationDocument';
import OrbitDBNotificationMapper from './mappers/OrbitDBNotificationMapper';

export default class OrbitDBNotificationRepository extends NotificationRepository {
  private readonly notificationIndex: OrbitDBHeadIndex<OrbitDBNotificationDocument>;

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBNotificationMapper,
  ) {
    super();
    this.notificationIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'notifications',
      documentFromRecord: (record) => this.documentFromRecord(record),
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
    });
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

  private headKey(notificationId: string): string {
    return `notification:${notificationId}`;
  }

  private recipientIndexHeadKey(recipientIdentityId: string): string {
    return `notification-recipient-index:${recipientIdentityId}`;
  }

  private async findRecipientIndexedDocuments(
    recipientIdentityId: IdentityId,
  ): Promise<OrbitDBNotificationDocument[]> {
    return (
      (await this.notificationIndex.find(
        this.recipientIndexHeadKey(recipientIdentityId.valueOf()),
      )) ?? []
    );
  }

  private async putHeads(document: OrbitDBNotificationDocument): Promise<void> {
    await this.registry.putHead(this.headKey(document.id), { ...document });

    const recipientIdentityId = new IdentityId(document.recipientIdentityId);
    const recipientDocuments =
      await this.findRecipientIndexedDocuments(recipientIdentityId);
    const notifications = this.notificationIndex.deduplicate([
      ...recipientDocuments,
      document,
    ]);

    await this.notificationIndex.putDocuments(
      this.recipientIndexHeadKey(document.recipientIdentityId),
      {
        id: this.recipientIndexHeadKey(document.recipientIdentityId),
        recipientIdentityId: document.recipientIdentityId,
      },
      notifications,
    );
  }

  private async findHead(
    notificationId: NotificationId,
  ): Promise<OrbitDBNotificationDocument | undefined> {
    const document = await this.registry.findHead(
      this.headKey(notificationId.valueOf()),
    );

    return document ? this.documentFromRecord(document) : undefined;
  }

  public async findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined> {
    const head = await this.findHead(notificationId);

    return head ? this.mapper.toDomain(head) : undefined;
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]> {
    const indexedDocuments =
      await this.findRecipientIndexedDocuments(recipientIdentityId);
    const documents = indexedDocuments;
    const beforeNotification = beforeNotificationId
      ? await this.findById(beforeNotificationId)
      : undefined;
    const beforeDocument = beforeNotification
      ? this.mapper.toDocument(beforeNotification)
      : undefined;

    return this.notificationIndex
      .deduplicate(documents)
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
