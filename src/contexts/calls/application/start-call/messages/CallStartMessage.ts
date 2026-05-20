import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { InvalidCallScopeError } from '../../../domain/errors/InvalidCallScopeError';
import { CallScopeType } from '../../../domain/value-objects/CallScopeType';

export class CallStartMessage {
  public readonly channelId?: CommunityChannelId;
  public readonly communityId?: CommunityId;
  public readonly conversationId?: ConversationId;
  public readonly invitedParticipantIds: IdentityId[];
  public readonly requesterIdentityId: IdentityId;
  public readonly scopeType: CallScopeType;

  constructor(
    requesterIdentityId: string,
    scopeType: string,
    conversationId?: string,
    communityId?: string,
    channelId?: string,
    invitedParticipantIds: string[] = [],
  ) {
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
    this.scopeType = new CallScopeType(scopeType);
    this.conversationId = conversationId
      ? new ConversationId(conversationId)
      : undefined;
    this.communityId = communityId ? new CommunityId(communityId) : undefined;
    this.channelId = channelId ? new CommunityChannelId(channelId) : undefined;
    this.invitedParticipantIds = invitedParticipantIds.map(
      (participantId) => new IdentityId(participantId),
    );
  }

  public getCommunityChannelId(): CommunityChannelId {
    if (!this.channelId) {
      throw new InvalidCallScopeError();
    }

    return this.channelId;
  }

  public getCommunityId(): CommunityId {
    if (!this.communityId) {
      throw new InvalidCallScopeError();
    }

    return this.communityId;
  }

  public getConversationId(): ConversationId {
    if (!this.conversationId) {
      throw new InvalidCallScopeError();
    }

    return this.conversationId;
  }
}
