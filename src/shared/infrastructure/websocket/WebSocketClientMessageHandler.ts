import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import IdentityPresenceHeartbeatRecorder from '@app/contexts/presence/application/record-heartbeat/IdentityPresenceHeartbeatRecorder';
import { IdentityPresenceHeartbeatMessage } from '@app/contexts/presence/application/record-heartbeat/messages/IdentityPresenceHeartbeatMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export default class WebSocketClientMessageHandler {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly communityRepository: CommunityRepository,
    private readonly heartbeatRecorder: IdentityPresenceHeartbeatRecorder,
  ) {}

  private excludeIdentity(
    identityIds: IdentityId[],
    identityId: IdentityId,
  ): string[] {
    return identityIds
      .filter((candidate) => !candidate.isEqual(identityId))
      .map((candidate) => candidate.valueOf());
  }

  public async findConversationTypingRecipients(
    identityId: string,
    conversationId: string,
  ): Promise<string[]> {
    const actorId = new IdentityId(identityId);
    const conversation = await this.conversationRepository.findMetadataById(
      new ConversationId(conversationId),
    );

    if (!conversation?.hasParticipant(actorId)) {
      return [];
    }

    return this.excludeIdentity(conversation.getParticipantIds(), actorId);
  }

  public async findCommunityChannelTypingRecipients(
    identityId: string,
    communityId: string,
    channelId: string,
  ): Promise<string[]> {
    const actorId = new IdentityId(identityId);
    const community = await this.communityRepository.findById(
      new CommunityId(communityId),
    );

    if (!community?.isMember(actorId)) {
      return [];
    }

    try {
      return this.excludeIdentity(
        community.visibleMembersForTextChannel(
          new CommunityChannelId(channelId),
        ),
        actorId,
      );
    } catch {
      return [];
    }
  }

  public async recordIdentityHeartbeat(
    identityId: string,
    active: boolean,
  ): Promise<void> {
    await this.heartbeatRecorder.record(
      new IdentityPresenceHeartbeatMessage(identityId, active),
    );
  }
}
