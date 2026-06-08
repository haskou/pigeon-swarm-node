import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationNetworkSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.network.sync_requested';

  public eventName(): string {
    return ConversationNetworkSyncRequestedEvent.EVENT_NAME;
  }
}
