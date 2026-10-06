/**
 * Action specific payload of a conversation operation. Every value is a JSON
 * primitive; `ConversationOperationApplier` documents and validates the shape
 * of each action.
 */
export type ConversationOperationArguments = Record<string, unknown>;
