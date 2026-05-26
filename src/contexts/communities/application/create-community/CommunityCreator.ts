import { Community } from '../../domain/Community';
import { CommunityRepository } from '../../domain/repositories/CommunityRepository';
import { CommunityCreateMessage } from './messages/CommunityCreateMessage';

export class CommunityCreator {
  constructor(private readonly repository: CommunityRepository) {}

  public async create(message: CommunityCreateMessage): Promise<Community> {
    const community = Community.create(
      message.ownerIdentityId,
      message.networkId,
      message.profile,
      message.settings,
    );

    await this.repository.save(community);

    return community;
  }
}
