import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityFindMessage {
  public readonly communityId: CommunityId;

  constructor(communityId: string) {
    this.communityId = new CommunityId(communityId);
  }
}
