import { DeletedCommunityChannelMessageResource } from '../resources/DeletedCommunityChannelMessageResource';

export class DeletedCommunityChannelMessageViewModel {
  constructor(
    private readonly resource: DeletedCommunityChannelMessageResource,
  ) {}

  public toResource(): DeletedCommunityChannelMessageResource {
    return this.resource;
  }
}
