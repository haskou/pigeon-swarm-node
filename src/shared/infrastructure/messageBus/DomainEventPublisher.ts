import {
  DomainEvent,
  DomainEventPublisher as KernelDomainEventPublisher,
} from '@haskou/ddd-kernel/domain';

export abstract class DomainEventPublisher extends KernelDomainEventPublisher {
  public abstract publish(domainEvents: DomainEvent[]): Promise<void>;
}
