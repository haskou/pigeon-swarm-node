import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class KeychainWasPublishedEvent extends DomainEvent {
  public static EVENT_NAME = 'keychains.v1.keychain.was_published';

  public eventName(): string {
    return KeychainWasPublishedEvent.EVENT_NAME;
  }
}
