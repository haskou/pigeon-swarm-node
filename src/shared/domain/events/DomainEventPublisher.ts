import DomainEvent from './DomainEvent';

export default abstract class DomainEventPublisher {
  public abstract publish(domainEvents: DomainEvent[]): Promise<void>;
}
