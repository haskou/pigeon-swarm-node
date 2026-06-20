import { Community } from '../../domain/Community';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunitiesFindMessage } from './messages/CommunitiesFindMessage';

export default class CommunitiesFinder {
  constructor(private readonly communityRepository: CommunityRepository) {}

  public async find(message: CommunitiesFindMessage): Promise<Community[]> {
    return this.communityRepository.findByMember(message.identityId);
  }
}
