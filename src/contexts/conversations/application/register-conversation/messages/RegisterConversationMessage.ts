import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { ConversationType } from '../../../domain/value-objects/ConversationType';
import { GroupConversationName } from '../../../domain/value-objects/GroupConversationName';

export class RegisterConversationMessage {
  public readonly conversationId: ConversationId;

  public readonly name?: GroupConversationName;

  public readonly networkId: NetworkId;

  public readonly participantIds: IdentityId[];

  public readonly type: ConversationType;

  constructor(payload: {
    conversationId: string;
    name?: string;
    networkId: string;
    participantIds: string[];
    type: string;
  }) {
    this.conversationId = new ConversationId(payload.conversationId);
    this.name = payload.name
      ? new GroupConversationName(payload.name)
      : undefined;
    this.networkId = new NetworkId(payload.networkId);
    this.participantIds = payload.participantIds.map(
      (participantId) => new IdentityId(participantId),
    );
    this.type = new ConversationType(payload.type);
  }

  public toConversationPrimitives(): PrimitiveOf<Conversation> {
    return {
      id: this.conversationId.valueOf(),
      messages: [],
      name: this.name?.valueOf(),
      networkId: this.networkId.valueOf(),
      participantIds: this.participantIds.map((participantId) =>
        participantId.valueOf(),
      ),
      type: this.type.valueOf(),
    };
  }
}
