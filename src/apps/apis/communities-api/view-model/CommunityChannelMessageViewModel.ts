import { CommunityChannelMessage } from '@app/contexts/communities/domain/CommunityChannelMessage';

import { CommunityChannelMessageResource } from '../resources/CommunityChannelMessageResource';

export class CommunityChannelMessageViewModel {
  constructor(private readonly message: CommunityChannelMessage) {}

  public toResource(): CommunityChannelMessageResource {
    return this.message.toPrimitives();
  }
}
