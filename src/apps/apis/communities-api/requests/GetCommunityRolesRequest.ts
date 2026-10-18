import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityRolesFindMessage } from '@app/contexts/communities/application/find-roles/messages/CommunityRolesFindMessage';
import { ShortId } from '@haskou/value-objects';

/** One page of a community's roles, read after the position of its cursor. */
export class GetCommunityRolesRequest {
  /** The built-in `everyone` role, or a derived short id. */
  private static isRoleId(position: string): boolean {
    if (position === 'everyone') return true;

    try {
      return new ShortId(position).valueOf() === position;
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

  /** The role to read after: the position of a decoded cursor, which must be a role id. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!GetCommunityRolesRequest.isRoleId(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/roles`;
  }

  public getMessage(): CommunityRolesFindMessage {
    return new CommunityRolesFindMessage(
      this.communityId,
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
