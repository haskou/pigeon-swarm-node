import CallSignalAcknowledger from '@app/contexts/calls/application/acknowledge-signal/CallSignalAcknowledger';
import { CallSignalAcknowledgeMessage } from '@app/contexts/calls/application/acknowledge-signal/messages/CallSignalAcknowledgeMessage';
import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import { Call } from '@app/contexts/calls/domain/Call';
import CallParticipantLeaseRepository from '@app/contexts/calls/domain/repositories/CallParticipantLeaseRepository';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import IdentityPresenceHeartbeatRecorder from '@app/contexts/presence/application/record-heartbeat/IdentityPresenceHeartbeatRecorder';
import { IdentityPresenceHeartbeatMessage } from '@app/contexts/presence/application/record-heartbeat/messages/IdentityPresenceHeartbeatMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CallRealtimeAudience } from './CallRealtimeAudience';

export default class WebSocketClientMessageHandler {
  private static readonly IDENTITY_UPDATE_CONVERSATION_LIMIT = 500;

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly communityRepository: CommunityRepository,
    private readonly heartbeatRecorder: IdentityPresenceHeartbeatRecorder,
    private readonly signalAcknowledger: CallSignalAcknowledger,
    private readonly callRepository: CallRepository,
    private readonly callLeases: CallParticipantLeaseRepository,
    private readonly callAccess: CallAccessAuthorizer,
  ) {}

  private excludeIdentity(
    identityIds: IdentityId[],
    identityId: IdentityId,
  ): string[] {
    return identityIds
      .filter((candidate) => !candidate.isEqual(identityId))
      .map((candidate) => candidate.valueOf());
  }

  public findActiveCommunityCalls(communityId: string): Promise<Call[]> {
    return this.callRepository.findActiveByCommunity(
      new CommunityId(communityId),
    );
  }

  public async findCallAudience(
    callId: string,
    candidates: string[],
  ): Promise<CallRealtimeAudience | undefined> {
    const call = await this.callRepository.findById(new CallId(callId));

    if (!call) return undefined;

    const participantsWithClients = candidates.filter(
      (identityId) =>
        call.getScope().isCommunityChannel() ||
        call.hasParticipant(new IdentityId(identityId)),
    );
    const visibility = await Promise.all(
      participantsWithClients.map((identityId) =>
        this.callAccess.canAccess(call, new IdentityId(identityId)),
      ),
    );
    const recipientIds = participantsWithClients.filter(
      (_identityId, index) => visibility[index],
    );
    const leases =
      recipientIds.length > 0
        ? await this.callLeases.findByCallIds([call.getId()])
        : [];

    const participants = await this.callAccess.authorizedParticipants(call);

    return { call, leases, participants, recipientIds };
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

  public async findCommunityChannelEventRecipients(
    communityId: string,
    channelId: string,
  ): Promise<string[]> {
    const community = await this.communityRepository.findById(
      new CommunityId(communityId),
    );

    if (!community) {
      return [];
    }

    try {
      return community
        .visibleMembersForTextChannel(new CommunityChannelId(channelId))
        .map((identityId) => identityId.valueOf());
    } catch {
      return [];
    }
  }

  public async findIdentityUpdateRecipients(
    identityId: string,
  ): Promise<string[]> {
    const actorId = new IdentityId(identityId);
    const [conversations, communities] = await Promise.all([
      this.conversationRepository.findByParticipant(
        actorId,
        WebSocketClientMessageHandler.IDENTITY_UPDATE_CONVERSATION_LIMIT,
      ),
      this.communityRepository.findByMember(actorId),
    ]);
    const recipients = new Set<string>();

    for (const conversation of conversations) {
      for (const recipient of this.excludeIdentity(
        conversation.getParticipantIds(),
        actorId,
      )) {
        recipients.add(recipient);
      }
    }

    for (const community of communities) {
      for (const recipient of this.excludeIdentity(
        community.findIdentityUpdateRecipientsFor(actorId),
        actorId,
      )) {
        recipients.add(recipient);
      }
    }

    return [...recipients];
  }

  public async recordIdentityHeartbeat(
    identityId: string,
    active: boolean,
  ): Promise<void> {
    await this.heartbeatRecorder.record(
      new IdentityPresenceHeartbeatMessage(identityId, active),
    );
  }

  public async acknowledgeCallSignal(
    identityId: string,
    signalId: string,
  ): Promise<void> {
    await this.signalAcknowledger.acknowledge(
      new CallSignalAcknowledgeMessage(signalId, identityId),
    );
  }
}
