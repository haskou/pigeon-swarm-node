import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class KeychainWasPublishedEvent extends DomainEvent {
  public static EVENT_NAME = 'keychains.v1.keychain.was_published';

  public eventName(): string {
    return KeychainWasPublishedEvent.EVENT_NAME;
  }
}
