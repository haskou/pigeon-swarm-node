import Event from '@app/shared/domain/events/Event';
import { UUID } from '@haskou/value-objects';

type Attributes = Record<string, unknown>;

export default abstract class DomainEvent implements Event {
  constructor(
    public readonly aggregateId: string,
    public readonly attributes: Attributes = {},
    public readonly eventId: string = UUID.generate().toString(),
    public readonly occurredOn: Date = new Date(),
    private correlationId?: string,
    private causationId?: string,
  ) {
    this.correlationId = correlationId || eventId;
    this.causationId = causationId || eventId;
  }

  public encode(data: string): object {
    return JSON.parse(data) as object;
  }

  public decode(): string {
    const data = {
      aggregate_id: this.aggregateId,
      attributes: this.attributes,
      causation_id: this.causationId,
      correlation_id: this.correlationId,
      event_id: this.eventId,
      occurred_on: this.occurredOn.getTime(),
      type: this.eventName(),
    };

    return JSON.stringify(data);
  }

  public getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  public getCausationId(): string | undefined {
    return this.causationId;
  }

  public withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;

    return this;
  }

  public withCausationId(causationId: string): this {
    this.causationId = causationId;

    return this;
  }

  public abstract eventName(): string;
}
