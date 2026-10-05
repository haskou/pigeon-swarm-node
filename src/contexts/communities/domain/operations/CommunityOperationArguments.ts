/**
 * Action specific payload of a community operation. Every value is a JSON
 * primitive; `CommunityOperationApplier` documents and validates the shape of
 * each action.
 */
export type CommunityOperationArguments = Record<string, unknown>;
