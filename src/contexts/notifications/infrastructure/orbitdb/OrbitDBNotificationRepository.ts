import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Notification } from '../../domain/Notification';
import { NotificationRepository } from '../../domain/repositories/NotificationRepository';
import { NotificationId } from '../../domain/value-objects/NotificationId';
import { OrbitDBNotificationDocument } from './documents/OrbitDBNotificationDocument';
import OrbitDBNotificationMapper from './mappers/OrbitDBNotificationMapper';

type Repository = NotificationRepository;

export default class OrbitDBNotificationRepository implements Repository {
  private readonly mapper: OrbitDBNotificationMapper;

  private readonly registry: OrbitDBReplicatedStateRegistry;

  constructor(
    registry?: OrbitDBReplicatedStateRegistry,
    mapper?: OrbitDBNotificationMapper,
  ) {
    this.registry = registry || OrbitDBReplicatedStateRegistry.shared();
    this.mapper = mapper || new OrbitDBNotificationMapper();
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
    const [document] = await this.findDocuments(
      (candidate) =>
        this.stringValue(candidate, 'id') === notificationId.valueOf(),
    );

    return document ? this.mapper.toDomain(document) : undefined;
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]> {
    const documents = await this.findDocuments(
      (candidate) =>
        this.stringValue(candidate, 'recipientIdentityId') ===
        recipientIdentityId.valueOf(),
    );
    const beforeDocument = beforeNotificationId
      ? documents.find(
          (document) => document.id === beforeNotificationId.valueOf(),
        )
      : undefined;

    return this.deduplicateDocuments(documents)
      .filter((document) =>
        beforeDocument ? document.createdAt < beforeDocument.createdAt : true,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map((document) => this.mapper.toDomain(document));
  }

  public async save(notification: Notification): Promise<void> {
    await this.registry.putDocument('notifications', {
      ...this.mapper.toDocument(notification),
    });
  }
}
