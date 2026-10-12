import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';

export default class CallAccessAuthorizer {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async assertAccess(call: Call, identityId: IdentityId): Promise<void> {
    const scope = call.getScope();
    const conversationId = scope.getConversationId();

    if (conversationId) {
      if (!(await this.conversationRepository.hasById(conversationId))) {
        throw new CallNotFoundError();
      }

      const conversation =
        await this.conversationRepository.requireMetadataById(conversationId);

      if (conversation.hasParticipant(identityId)) return;

      throw new CallNotFoundError();
    }

    const communityId = scope.getCommunityId();
    const channelId = scope.getCommunityChannelId();

    if (
      !communityId ||
      !channelId ||
      !(await this.communityRepository.hasById(communityId))
    ) {
      throw new CallNotFoundError();
    }

    const community = await this.communityRepository.requireById(communityId);

    try {
      community.authorizeVoiceChannelCall(identityId, channelId);
    } catch {
      throw new CallNotFoundError();
    }
  }

  public async authorizedParticipants(call: Call): Promise<IdentityId[]> {
    const participants = call
      .getActiveParticipants()
      .map((participant) => participant.getIdentityId());
    const visibility = await Promise.all(
      participants.map((identityId) => this.canAccess(call, identityId)),
    );

    return participants.filter((_identityId, index) => visibility[index]);
  }

  public async canAccess(call: Call, identityId: IdentityId): Promise<boolean> {
    try {
      await this.assertAccess(call, identityId);

      return true;
    } catch {
      return false;
    }
  }
}
