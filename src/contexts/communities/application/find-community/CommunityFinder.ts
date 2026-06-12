import { Community } from '../../domain/Community';
import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityFindMessage } from './messages/CommunityFindMessage';

export default class CommunityFinder {
  constructor(private readonly repository: CommunityRepository) {}

  public async find(message: CommunityFindMessage): Promise<Community> {
    const community = await this.repository.findById(message.communityId);

    if (!community) {
      throw new CommunityNotFoundError();
    }

    return community;
  }
}
