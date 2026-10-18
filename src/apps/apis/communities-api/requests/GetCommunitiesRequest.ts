import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunitiesFindMessage } from '@app/contexts/communities/application/find-communities/messages/CommunitiesFindMessage';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';

/** One page of the communities a member belongs to, read after the position of its cursor. */
export class GetCommunitiesRequest {
  public constructor(
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The community to read after: the position of a decoded cursor, which must be a community id. */
  private afterCommunityId(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    try {
      return new CommunityId(position).valueOf();
    } catch {
      throw new InvalidPageCursorError();
    }
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return 'communities';
  }

  public getMessage(): CommunitiesFindMessage {
    return new CommunitiesFindMessage(
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterCommunityId(),
    );
  }
}
