import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Call } from '../../domain/Call';
import { CallNotFoundError } from '../../domain/errors/CallNotFoundError';
import { CallCapabilityHash } from '../../domain/value-objects/CallCapabilityHash';

export default class CallAccessAuthorizer {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly communityRepository: CommunityRepository,
  ) {}

  /**
   * A group-capability call admits whoever presents its capability. Without
   * one, only an identity already holding a place in its lease roster passes:
   * that is how its realtime audience and signal recipients are authorized.
   */
  private assertCapabilityAccess(
    call: Call,
    capabilityHash: CallCapabilityHash,
    identityId: IdentityId,
    capability?: string,
  ): void {
    const admitted =
      capability === undefined
        ? call.hasJoinedParticipant(identityId)
        : capabilityHash.matches(capability);

    if (!admitted) throw new CallNotFoundError();
  }

  private async assertConversationAccess(
    conversationId: ConversationId,
    identityId: IdentityId,
  ): Promise<void> {
    if (!(await this.conversationRepository.hasById(conversationId))) {
      throw new CallNotFoundError();
    }

    const conversation =
      await this.conversationRepository.requireMetadataById(conversationId);

    if (!conversation.hasParticipant(identityId)) {
      throw new CallNotFoundError();
    }
  }

  private async assertCommunityAccess(
    identityId: IdentityId,
    communityId?: CommunityId,
    channelId?: CommunityChannelId,
  ): Promise<void> {
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

  public async assertAccess(
    call: Call,
    identityId: IdentityId,
    capability?: string,
  ): Promise<void> {
    const scope = call.getScope();
    const capabilityHash = scope.getCapabilityHash();

    if (capabilityHash) {
      this.assertCapabilityAccess(call, capabilityHash, identityId, capability);

      return;
    }

    const conversationId = scope.getConversationId();

    if (conversationId) {
      await this.assertConversationAccess(conversationId, identityId);

      return;
    }

    await this.assertCommunityAccess(
      identityId,
      scope.getCommunityId(),
      scope.getCommunityChannelId(),
    );
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
