import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { ConversationOperationAction } from '../../../domain/value-objects/ConversationOperationAction';
import { ConversationOperationMutation } from '../../record-operation/ConversationOperationMutation';
import { ConversationOperationMutationPrimitives } from '../../record-operation/ConversationOperationMutationPrimitives';

/**
 * One signed change of a group: a member added or removed, an admin promoted
 * or demoted, or the author leaving. `targetIdentityId` is the identity the
 * action refers to; a leave has none.
 */
export class ConversationMemberChangeMessage {
  public readonly action: ConversationOperationAction;
  public readonly actorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly operation: ConversationOperationMutation;
  public readonly targetIdentityId?: IdentityId;

  constructor(
    conversationId: string,
    actorIdentityId: string,
    action: ConversationOperationAction,
    operation: ConversationOperationMutationPrimitives,
    targetIdentityId?: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.action = action;
    this.operation = new ConversationOperationMutation(operation);
    this.targetIdentityId = targetIdentityId
      ? new IdentityId(targetIdentityId)
      : undefined;
  }
}
