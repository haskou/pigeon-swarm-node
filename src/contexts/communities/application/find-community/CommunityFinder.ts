import { Community } from '../../domain/Community';
import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityFindMessage } from './messages/CommunityFindMessage';

export default class CommunityFinder {
  constructor(private readonly repository: CommunityRepository) {}

  public async find(message: CommunityFindMessage): Promise<Community> {
    return this.findById(message.communityId);
  }

  public async findById(communityId: CommunityId): Promise<Community> {
    const community = await this.repository.findById(communityId);

    if (!community) {
      throw new CommunityNotFoundError();
    }

    return community;
  }
}
