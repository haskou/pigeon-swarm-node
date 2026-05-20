import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { Call } from '../Call';
import { CallId } from '../value-objects/CallId';

export interface CallRepository {
  findActiveByCommunity(communityId: CommunityId): Promise<Call[]>;
  findActiveByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call | undefined>;
  findActiveByParticipant(participantId: IdentityId): Promise<Call[]>;
  findByCommunityChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<Call[]>;
  findByConversationId(conversationId: ConversationId): Promise<Call[]>;
  findById(id: CallId): Promise<Call | undefined>;
  findByParticipant(participantId: IdentityId): Promise<Call[]>;
  findTimedOutJoinedCalls(timeoutThreshold: Timestamp): Promise<Call[]>;
  findTimedOutRingingCalls(timeoutThreshold: Timestamp): Promise<Call[]>;
  save(call: Call): Promise<void>;
}
