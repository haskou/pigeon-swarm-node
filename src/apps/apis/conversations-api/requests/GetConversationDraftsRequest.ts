import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { ConversationDraftPosition } from '@app/contexts/conversations/application/manage-draft/ConversationDraftPosition';
import { ConversationDraftsFindMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftsFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

/** One page of the caller's drafts, read after the position of its cursor. */
export class GetConversationDraftsRequest {
  private static readonly RESOURCE = 'conversation-drafts';

  constructor(
    private readonly identityId: IdentityId,
    private readonly limit: unknown,
    private readonly cursor: string | undefined,
  ) {}

  /** The draft to read after: the position of a decoded cursor, which must be a draft position. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(
      this.cursor,
      GetConversationDraftsRequest.RESOURCE,
    );

    if (!ConversationDraftPosition.isValid(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  public getMessage(): ConversationDraftsFindMessage {
    return new ConversationDraftsFindMessage(
      this.identityId.valueOf(),
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
          resource: GetConversationDraftsRequest.RESOURCE,
        });
  }
}
