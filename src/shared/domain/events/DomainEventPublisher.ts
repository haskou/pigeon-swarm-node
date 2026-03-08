import DomainEvent from './DomainEvent';

interface DomainEventPublisher {
  publish(domainEvents: DomainEvent[]): Promise<void>;
}

export default DomainEventPublisher;
