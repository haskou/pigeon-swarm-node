import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';

import { CallScope } from '../../domain/CallScope';
import { InvalidCallScopeError } from '../../domain/errors/InvalidCallScopeError';
import { CallStartMessage } from './messages/CallStartMessage';
import { ResolvedCallScope } from './ResolvedCallScope';

export default class CallScopeResolver {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly communityRepository: CommunityRepository,
    private readonly identityRepository: IdentityRepository,
  ) {}

  private async resolveCommunityChannel(
    message: CallStartMessage,
  ): Promise<ResolvedCallScope> {
    const communityId = message.getCommunityId();
    const channelId = message.getCommunityChannelId();

    if (!(await this.communityRepository.hasById(communityId))) {
      throw new InvalidCallScopeError();
    }

    const community = await this.communityRepository.requireById(communityId);
    community.authorizeVoiceChannelCall(message.requesterIdentityId, channelId);

    return new ResolvedCallScope(
      community.getNetworkId(),
      [message.requesterIdentityId],
      CallScope.communityChannel(communityId, channelId),
    );
  }

  /**
   * A conversation call is a 1:1 call between its participants. Group calls
   * carry an MLS capability instead: the node never knows a group's roster.
   */
  private async resolveConversation(
    message: CallStartMessage,
  ): Promise<ResolvedCallScope> {
    const conversationId = message.getConversationId();

    if (!(await this.conversationRepository.hasById(conversationId))) {
      throw new InvalidCallScopeError();
    }

    const conversation =
      await this.conversationRepository.requireMetadataById(conversationId);

    if (!conversation.hasParticipant(message.requesterIdentityId)) {
      throw new InvalidCallScopeError();
    }

    return new ResolvedCallScope(
      conversation.getNetworkId(),
      conversation.getParticipantIds(),
      CallScope.conversation(conversationId),
    );
  }

  /**
   * The node knows nothing of the group: it only keeps the call on a network
   * its creator belongs to, as every node of that network replicates it.
   */
  private async resolveGroupCapability(
    message: CallStartMessage,
  ): Promise<ResolvedCallScope> {
    const networkId = message.getNetworkId();
    const creator = await this.identityRepository.findById(
      message.requesterIdentityId,
    );

    if (
      !creator.getNetworkIds().some((candidate) => candidate.isEqual(networkId))
    ) {
      throw new InvalidCallScopeError();
    }

    return new ResolvedCallScope(
      networkId,
      [message.requesterIdentityId],
      CallScope.groupCapability(message.getCapabilityHash()),
    );
  }

  public async resolve(message: CallStartMessage): Promise<ResolvedCallScope> {
    if (message.scopeType.isConversation()) {
      return this.resolveConversation(message);
    }

    if (message.scopeType.isGroupCapability()) {
      return this.resolveGroupCapability(message);
    }

    return this.resolveCommunityChannel(message);
  }
}
