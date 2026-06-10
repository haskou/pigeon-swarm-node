import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { Call } from '../Call';
import { CallId } from '../value-objects/CallId';

export default abstract class CallRepository {
  public abstract findActiveByCommunity(
    communityId: CommunityId,
  ): Promise<Call[]>;

  public abstract findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined>;

  public abstract findActiveByParticipant(
    participantId: IdentityId,
  ): Promise<Call[]>;

  public abstract findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]>;

  public abstract findByConversationId(
    conversationId: ConversationId,
  ): Promise<Call[]>;

  public abstract findById(id: CallId): Promise<Call | undefined>;
  public abstract findByParticipant(participantId: IdentityId): Promise<Call[]>;

  public abstract findTimedOutJoinedCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]>;

  public abstract findTimedOutRingingCalls(
    timeoutThreshold: Timestamp,
  ): Promise<Call[]>;

  public abstract save(call: Call): Promise<void>;
}
