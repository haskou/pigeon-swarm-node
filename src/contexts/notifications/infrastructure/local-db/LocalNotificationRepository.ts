import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { Notification } from '../../domain/Notification';
import { NotificationId } from '../../domain/value-objects/NotificationId';

/** Local, derived notifications (missed calls). Never replicated. */
export default class LocalNotificationRepository {
  private static readonly NAMESPACE = 'local_notifications';

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private toDomain(document: Record<string, unknown>): Notification {
    const { _id, ...primitives } = document;

    void _id;

    return Notification.fromPrimitives(
      primitives as Parameters<typeof Notification.fromPrimitives>[0],
    );
  }

  public async findById(id: NotificationId): Promise<Notification | undefined> {
    const document = await this.database.findOne(
      LocalNotificationRepository.NAMESPACE,
      id.valueOf(),
    );

    return document ? this.toDomain(document) : undefined;
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
  ): Promise<Notification[]> {
    return (
      await this.database.find(
        LocalNotificationRepository.NAMESPACE,
        (document) =>
          document.recipientIdentityId === recipientIdentityId.valueOf(),
      )
    ).map((document) => this.toDomain(document));
  }

  public async save(notification: Notification): Promise<void> {
    const primitives = notification.toPrimitives();

    await this.database.save(
      LocalNotificationRepository.NAMESPACE,
      primitives.id,
      {
        ...primitives,
      },
    );
  }
}
