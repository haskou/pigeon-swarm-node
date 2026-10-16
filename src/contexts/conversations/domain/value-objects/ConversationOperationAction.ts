import { Enum } from '@haskou/value-objects';

/**
 * A conversation operation only creates a 1:1 conversation. Group rosters
 * live in MLS, so the member and admin actions older nodes signed are not
 * values of this enum and their records are refused when decoded.
 */
const conversationOperationActions = {
  CONVERSATION_CREATED: 'conversation_created',
} as const;

export class ConversationOperationAction extends Enum<string> {
  public static readonly CONVERSATION_CREATED = new ConversationOperationAction(
    conversationOperationActions.CONVERSATION_CREATED,
  );

  public getValues(): string[] {
    return Object.values(conversationOperationActions);
  }

  public isGenesis(): boolean {
    return this.isEqual(ConversationOperationAction.CONVERSATION_CREATED);
  }
}
