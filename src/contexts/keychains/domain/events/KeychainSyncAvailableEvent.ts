import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class KeychainSyncAvailableEvent extends DomainEvent {
  public static EVENT_NAME = 'keychains.v1.keychain.sync_available';

  public eventName(): string {
    return KeychainSyncAvailableEvent.EVENT_NAME;
  }
}
