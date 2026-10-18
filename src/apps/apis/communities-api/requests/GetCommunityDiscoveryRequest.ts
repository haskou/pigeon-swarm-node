import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunitiesDiscoverMessage } from '@app/contexts/communities/application/discover-communities/messages/CommunitiesDiscoverMessage';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';

/** One page of discoverable communities, read after the position of its cursor. */
export class GetCommunityDiscoveryRequest {
  public constructor(
    private readonly actorIdentityId: string,
    private readonly networkId: string | undefined,
    private readonly query: string | undefined,
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
    return 'discoverable-communities';
  }

  public getMessage(): CommunitiesDiscoverMessage {
    return new CommunitiesDiscoverMessage(
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterCommunityId(),
      this.networkId,
      this.query,
    );
  }
}
