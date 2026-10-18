import { Conversation } from './Conversation';

/** A conversation with the time its creation record was folded in, in epoch milliseconds. */
export class DatedConversation {
  constructor(
    public readonly conversation: Conversation,
    public readonly createdAt: number,
  ) {}
}
