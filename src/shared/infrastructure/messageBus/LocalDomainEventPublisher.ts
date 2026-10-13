import { DomainEvent } from '@haskou/ddd-kernel/domain';

export abstract class LocalDomainEventPublisher {
  public abstract publishLocally(domainEvents: DomainEvent[]): Promise<void>;
}
