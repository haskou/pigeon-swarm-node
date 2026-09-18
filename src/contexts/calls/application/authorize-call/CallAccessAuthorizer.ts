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
      const conversation =
        await this.conversationRepository.findMetadataById(conversationId);

      if (conversation?.hasParticipant(identityId)) return;

      throw new CallNotFoundError();
    }

    const communityId = scope.getCommunityId();
    const channelId = scope.getCommunityChannelId();
    const community = communityId
      ? await this.communityRepository.findById(communityId)
      : undefined;

    if (!community || !channelId) throw new CallNotFoundError();

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
