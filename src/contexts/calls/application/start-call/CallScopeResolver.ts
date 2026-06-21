import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';

import { CallScope } from '../../domain/CallScope';
import { InvalidCallScopeError } from '../../domain/errors/InvalidCallScopeError';
import { CallStartMessage } from './messages/CallStartMessage';
import { ResolvedCallScope } from './ResolvedCallScope';

export default class CallScopeResolver {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly communityRepository: CommunityRepository,
  ) {}

  private async resolveCommunityChannel(
    message: CallStartMessage,
  ): Promise<ResolvedCallScope> {
    const communityId = message.getCommunityId();
    const channelId = message.getCommunityChannelId();
    const community = await this.communityRepository.findById(communityId);

    if (!community) {
      throw new InvalidCallScopeError();
    }

    return new ResolvedCallScope(
      community.getNetworkId(),
      community.membersForVoiceChannelCall(
        message.requesterIdentityId,
        channelId,
      ),
      CallScope.communityChannel(communityId, channelId),
    );
  }

  private async resolveConversation(
    message: CallStartMessage,
  ): Promise<ResolvedCallScope> {
    const conversationId = message.getConversationId();
    const conversation =
      await this.conversationRepository.findMetadataById(conversationId);

    if (
      !conversation ||
      !conversation.hasParticipant(message.requesterIdentityId)
    ) {
      throw new InvalidCallScopeError();
    }

    return new ResolvedCallScope(
      conversation.getNetworkId(),
      conversation.getParticipantIds(),
      CallScope.conversation(conversationId),
    );
  }

  public async resolve(message: CallStartMessage): Promise<ResolvedCallScope> {
    if (message.scopeType.isConversation()) {
      return this.resolveConversation(message);
    }

    return this.resolveCommunityChannel(message);
  }
}
