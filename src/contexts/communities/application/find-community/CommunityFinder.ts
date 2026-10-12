import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../domain/value-objects/CommunityId';
import { CommunityFindMessage } from './messages/CommunityFindMessage';

export default class CommunityFinder {
  constructor(private readonly repository: CommunityRepository) {}

  public async find(message: CommunityFindMessage): Promise<Community> {
    return this.findById(message.communityId);
  }

  public async findById(communityId: CommunityId): Promise<Community> {
    return this.repository.requireById(communityId);
  }

  /** The parents the next signed operation of the community must reference. */
  public findFrontier(communityId: CommunityId): Promise<string[]> {
    return this.repository.findFrontier(communityId);
  }
}
