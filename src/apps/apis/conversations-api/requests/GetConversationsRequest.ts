import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { ConversationPosition } from '@app/contexts/conversations/application/find-conversations/ConversationPosition';
import { ConversationsFindMessage } from '@app/contexts/conversations/application/find-conversations/messages/ConversationsFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

/** One page of the requester's conversations, read after the position of its cursor. */
export class GetConversationsRequest {
  private static readonly RESOURCE = 'conversations';

  constructor(
    private readonly requesterIdentityId: IdentityId,
    private readonly limit: unknown,
    private readonly cursor: string | undefined,
  ) {}

  /** The conversation to read after: the position of a decoded cursor, which must be a conversation position. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(
      this.cursor,
      GetConversationsRequest.RESOURCE,
    );

    if (!ConversationPosition.isValid(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  public getMessage(): ConversationsFindMessage {
    return new ConversationsFindMessage(
      this.requesterIdentityId.valueOf(),
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }

  /** The cursor reading after `nextPosition`, or null when the list ends. */
  public nextCursor(nextPosition: string | undefined): string | null {
    return nextPosition === undefined
      ? null
      : PageCursor.encode({
          position: nextPosition,
          resource: GetConversationsRequest.RESOURCE,
        });
  }
}
