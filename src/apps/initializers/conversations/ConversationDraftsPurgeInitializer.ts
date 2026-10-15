import UnkeyedConversationDraftsPurger from '@app/contexts/conversations/application/purge-unkeyed-drafts/UnkeyedConversationDraftsPurger';

/** Deletes, at every startup, drafts that still name their conversation. */
export default class ConversationDraftsPurgeInitializer {
  constructor(private readonly purger: UnkeyedConversationDraftsPurger) {}

  public ensure(): Promise<void> {
    return this.purger.purge();
  }
}
