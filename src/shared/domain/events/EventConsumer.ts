import Event from './Event';
import { EventConstructor } from './EventConstructor';

interface EventConsumer {
  consume(
    queueName: string,
    bindingKey: string,
    domainEvent: EventConstructor<Event>,
    exchange: string,
    handler: (event: Event) => Promise<void>,
  ): Promise<void>;
}

export default EventConsumer;
