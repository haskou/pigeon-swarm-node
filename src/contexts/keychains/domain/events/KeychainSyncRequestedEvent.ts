import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class KeychainSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'keychains.v1.keychain.sync_requested';

  public eventName(): string {
    return KeychainSyncRequestedEvent.EVENT_NAME;
  }
}
