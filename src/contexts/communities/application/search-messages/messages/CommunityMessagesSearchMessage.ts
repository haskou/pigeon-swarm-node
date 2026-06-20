import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityMessagesSearchMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly limit: number;
  public readonly query: string;

  constructor(
    communityId: string,
    actorIdentityId: string,
    query: string | undefined,
    limit: number | undefined,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.limit = Math.min(Math.max(limit ?? 20, 1), 50);
    this.query = query ?? '';
  }
}
