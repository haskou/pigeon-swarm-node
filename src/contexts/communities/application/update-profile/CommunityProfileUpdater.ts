import { Community } from '../../domain/Community';
import { CommunityRepository } from '../../domain/repositories/CommunityRepository';
import { CommunityProfileUpdateMessage } from './messages/CommunityProfileUpdateMessage';

export class CommunityProfileUpdater {
  constructor(private readonly repository: CommunityRepository) {}

  public async update(
    community: Community,
    message: CommunityProfileUpdateMessage,
  ): Promise<Community> {
    community.updateProfile(
      message.actorIdentityId,
      message.name,
      message.description,
      message.avatar,
      message.banner,
      message.discoverable,
    );

    await this.repository.save(community);

    return community;
  }
}
