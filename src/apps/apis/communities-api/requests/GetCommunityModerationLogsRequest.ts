import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { CommunityModerationLogsFindMessage } from '@app/contexts/communities/application/find-moderation-logs/messages/CommunityModerationLogsFindMessage';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';

/** One page of a community's moderation log, read older than the position of its cursor. */
export class GetCommunityModerationLogsRequest {
  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: number | undefined,
  ) {}

  /** The log to read before: the position of a decoded cursor, which must be a log id. */
  private beforeLogId(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    try {
      return new CommunityModerationLogId(position).valueOf();
    } catch {
      throw new InvalidPageCursorError();
    }
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/moderation-logs`;
  }

  public getMessage(): CommunityModerationLogsFindMessage {
    return new CommunityModerationLogsFindMessage(
      this.communityId,
      this.actorIdentityId,
      this.limit,
      this.beforeLogId(),
    );
  }
}
