import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityChannelMessagePinsFindMessage } from '@app/contexts/communities/application/manage-channel-message-pin/messages/CommunityChannelMessagePinsFindMessage';
import { PageTimestamp } from '@app/contexts/communities/application/pagination/PageTimestamp';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';

/** One page of a channel's pins, read after the position of its cursor. */
export class GetCommunityChannelMessagePinsRequest {
  private static readonly POSITION_PATTERN = /^(\d{17})\|(.+)$/;

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly channelId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The position to read after: a decoded cursor of `createdAt|messageId`. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());
    const match =
      GetCommunityChannelMessagePinsRequest.POSITION_PATTERN.exec(position);

    if (match === null || !this.isValidPin(match[1], match[2])) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  private isValidPin(createdAt: string, messageId: string): boolean {
    try {
      return (
        PageTimestamp.isValid(createdAt) &&
        new CommunityChannelMessageId(messageId).valueOf() === messageId
      );
    } catch {
      return false;
    }
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/channels/${this.channelId}/pins`;
  }

  public getMessage(): CommunityChannelMessagePinsFindMessage {
    return new CommunityChannelMessagePinsFindMessage(
      this.actorIdentityId,
      this.communityId,
      this.channelId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
