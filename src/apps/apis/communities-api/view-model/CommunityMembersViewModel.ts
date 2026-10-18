import { CommunityMembersResource } from '../resources/CommunityMembersResource';

export class CommunityMembersViewModel {
  constructor(
    private readonly memberIds: string[],
    private readonly nextCursor: string | null,
  ) {}

  public toResource(): CommunityMembersResource {
    return {
      memberIds: this.memberIds,
      nextCursor: this.nextCursor,
    };
  }
}
