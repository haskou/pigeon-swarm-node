import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { NotificationsFindMessage } from '@app/contexts/notifications/application/find/messages/NotificationsFindMessage';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

/** One page of the caller's notifications, read after the position of its cursor. */
export class GetNotificationsRequest {
  private static readonly RESOURCE = 'notifications';

  /** Only the ids a notification can carry: an invitation or a missed call. */
  private static isNotificationId(position: string): boolean {
    try {
      const id = new NotificationId(position);

      return id.isInvitation() || id.isMissedCall();
    } catch {
      return false;
    }
  }

  constructor(
    private readonly recipientIdentityId: IdentityId,
    private readonly limit: unknown,
    private readonly cursor: string | undefined,
  ) {}

  /** The notification to read after: the position of a decoded cursor, which must be a notification id. */
  private afterNotificationId(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(
      this.cursor,
      GetNotificationsRequest.RESOURCE,
    );

    if (!GetNotificationsRequest.isNotificationId(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  public getMessage(): NotificationsFindMessage {
    return new NotificationsFindMessage(
      this.recipientIdentityId.valueOf(),
      PageLimit.parse(this.limit),
      this.afterNotificationId(),
    );
  }

  /** The cursor reading after `nextPosition`, or null when the list ends. */
  public nextCursor(nextPosition: string | undefined): string | null {
    return nextPosition === undefined
      ? null
      : PageCursor.encode({
          position: nextPosition,
          resource: GetNotificationsRequest.RESOURCE,
        });
  }
}
