import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityChannelDraftsFindMessage } from '@app/contexts/communities/application/manage-channel-draft/messages/CommunityChannelDraftsFindMessage';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';

/** One page of an identity's drafts, read after the position of its cursor. */
export class GetCommunityChannelDraftsRequest {
  /** The three parts of a canonical position, or undefined when it is not one. */
  private static partsOf(position: string): string[] | undefined {
    let parsed: unknown;

    try {
      parsed = JSON.parse(position);
    } catch {
      return undefined;
    }

    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      !parsed.every((part) => typeof part === 'string') ||
      JSON.stringify(parsed) !== position
    ) {
      return undefined;
    }

    return parsed as string[];
  }

  public constructor(
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The position to read after: a decoded cursor of `[updatedAt, communityId, channelId]`. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!this.isValidPosition(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  private isValidPosition(position: string): boolean {
    const parts = GetCommunityChannelDraftsRequest.partsOf(position);

    if (parts === undefined) return false;

    const [updatedAt, communityId, channelId] = parts;

    try {
      return (
        new Date(updatedAt).toISOString() === updatedAt &&
        new CommunityId(communityId).valueOf() === communityId &&
        new CommunityChannelId(channelId).valueOf() === channelId
      );
    } catch {
      return false;
    }
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return 'community-drafts';
  }

  public getMessage(): CommunityChannelDraftsFindMessage {
    return new CommunityChannelDraftsFindMessage(
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
