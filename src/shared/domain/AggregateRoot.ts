import DomainEvent from './events/DomainEvent';

interface WithPrimitives {
  toPrimitives(): unknown;
}

export default abstract class AggregateRoot implements WithPrimitives {
  private domainEvents: DomainEvent[] = [];

  public pullDomainEvents(): DomainEvent[] {
    const domainEvents = this.domainEvents;
    this.domainEvents = [];

    return domainEvents;
  }

  protected record(domainEvent: DomainEvent): void {
    this.domainEvents.push(domainEvent);
  }

  public abstract toPrimitives(): unknown;
}
