import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityChannelsFindMessage } from '@app/contexts/communities/application/find-channels/messages/CommunityChannelsFindMessage';
import { ShortId } from '@haskou/value-objects';

/** One page of a community's visible channels, read after the position of its cursor. */
export class GetCommunityChannelsRequest {
  /** A position is `text|<channelId>` or `voice|<channelId>`, so text channels sort first. */
  private static readonly POSITION_PATTERN = /^(text|voice)\|(.+)$/;

  private static isChannelPosition(position: string): boolean {
    const match = GetCommunityChannelsRequest.POSITION_PATTERN.exec(position);

    if (match === null) return false;

    try {
      return new ShortId(match[2]).valueOf() === match[2];
    } catch {
      return false;
    }
  }

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The channel to read after: the position of a decoded cursor, which must name a channel. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!GetCommunityChannelsRequest.isChannelPosition(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/channels`;
  }

  public getMessage(): CommunityChannelsFindMessage {
    return new CommunityChannelsFindMessage(
      this.communityId,
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
