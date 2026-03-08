import Event from './Event';

interface EventConsumer {
  consume(
    queueName: string,
    bindingKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    domainEvent: any,
    exchange: string,
    handler: (event: Event) => Promise<void>,
  ): Promise<void>;
}

export default EventConsumer;
