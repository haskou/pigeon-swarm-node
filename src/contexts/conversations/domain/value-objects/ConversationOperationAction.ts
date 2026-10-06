import { Enum } from '@haskou/value-objects';

const conversationOperationActions = {
  ADMIN_DEMOTED: 'admin_demoted',
  ADMIN_PROMOTED: 'admin_promoted',
  CONVERSATION_CREATED: 'conversation_created',
  MEMBER_ADDED: 'member_added',
  MEMBER_LEFT: 'member_left',
  MEMBER_REMOVED: 'member_removed',
} as const;

export class ConversationOperationAction extends Enum<string> {
  public static readonly ADMIN_DEMOTED = new ConversationOperationAction(
    conversationOperationActions.ADMIN_DEMOTED,
  );

  public static readonly ADMIN_PROMOTED = new ConversationOperationAction(
    conversationOperationActions.ADMIN_PROMOTED,
  );

  public static readonly CONVERSATION_CREATED = new ConversationOperationAction(
    conversationOperationActions.CONVERSATION_CREATED,
  );

  public static readonly MEMBER_ADDED = new ConversationOperationAction(
    conversationOperationActions.MEMBER_ADDED,
  );

  public static readonly MEMBER_LEFT = new ConversationOperationAction(
    conversationOperationActions.MEMBER_LEFT,
  );

  public static readonly MEMBER_REMOVED = new ConversationOperationAction(
    conversationOperationActions.MEMBER_REMOVED,
  );

  public getValues(): string[] {
    return Object.values(conversationOperationActions);
  }

  public isGenesis(): boolean {
    return this.isEqual(ConversationOperationAction.CONVERSATION_CREATED);
  }
}
