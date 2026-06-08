import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class KeychainNetworkSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'keychains.v1.network.sync_requested';

  public eventName(): string {
    return KeychainNetworkSyncRequestedEvent.EVENT_NAME;
  }
}
