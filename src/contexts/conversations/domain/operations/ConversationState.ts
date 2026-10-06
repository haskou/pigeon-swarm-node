import { ConversationRoster } from './ConversationRoster';

export type ConversationState = {
  /** Digests of the operations nobody references as parent, sorted. */
  frontier: string[];
  /** The roster after every permitted operation, when a genesis is known. */
  roster?: ConversationRoster;
  /** Digests of the operations that were not permitted at their turn. */
  skipped: string[];
};
