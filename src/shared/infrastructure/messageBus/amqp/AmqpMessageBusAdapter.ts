import Kernel from '@app/Kernel';
import amqplib, {
  Channel,
  ConsumeMessage,
  MessagePropertyHeaders,
  Options,
} from 'amqplib';
import NoFailedMessagesError from '../../errors/NoFailedMessagesError';
import MessageBusAdapter from '../MessageBusAdapter';
import { Message } from '../Message';
import InvalidDomainEventError from '../../errors/InvalidDomainEventError';
import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { UUID } from '@haskou/value-objects';

export default class AmqpMessageBusAdapter implements MessageBusAdapter {
  private _exchange: string;
  private _channel: Channel;
  private _delayConsumers: string[] = [];

  public async areQueuesBound(): Promise<boolean> {
    if (Kernel.consumers.length === 0) {
      return false;
    }
    const channel = await this.channel();
    for (const consumer of Kernel.consumers) {
      const queueChecker = await channel.checkQueue(consumer.queueName);

      if (queueChecker.consumerCount !== 0) {
        return false;
      }
    }

    return true;
  }

  public async consumeDlx(
    queueName: string,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: (event: DomainEvent) => Promise<void>,
    messagesToRetry?: number,
  ): Promise<void> {
    const dlxQueueName = `${queueName}_dlx`;
    const channel = await this.channel(true);
    channel.on('error', () => {
      Kernel.logger.error(`AMQP Message bus event error`);
    });
    const queue = await channel.checkQueue(dlxQueueName);

    if (undefined === messagesToRetry) {
      messagesToRetry = queue.messageCount;
    }
    Kernel.logger.info(
      // eslint-disable-next-line max-len
      `Retrying ${messagesToRetry} messages from DLX ${dlxQueueName}`,
    );

    if (messagesToRetry > 0 && queue.messageCount !== 0) {
      for (let index = 0; index < messagesToRetry; index++) {
        const msg = await channel.get(dlxQueueName);

        if (msg !== false) {
          Kernel.logger.info(
            `Retrying message from DLX ${msg.content.toString()}`,
          );
          const message = JSON.parse(msg.content.toString()) as Message;
          try {
            const domainEvent = this.instanceDomainEvent(
              DomainEventInstance,
              message,
            );
            await handler(domainEvent);
            Kernel.logger.info(
              `${msg.content.toString()} succesfully handled.`,
            );
            channel.ack(msg);
          } catch (error) {
            Kernel.logger.error(
              `${msg.content.toString()} error with ${error.message}.`,
            );
            channel.nack(msg);
          }
        }
      }

      return;
    }
    throw new NoFailedMessagesError(dlxQueueName);
  }

  public async consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    const channel = await this.channel();
    await channel.assertQueue(queueName, { durable: true });
    await channel.assertExchange(exchange, 'topic');
    await channel.prefetch(1);
    await channel.bindQueue(queueName, exchange, bindingKey);
    await channel.consume(queueName, async (msg: ConsumeMessage) => {
      await this.handle(
        msg,
        DomainEventInstance,
        handler,
        channel,
        queueName,
        bindingKey,
      );
      channel.ack(msg);
    });
  }

  private async handle(
    msg: ConsumeMessage,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: (event: DomainEvent) => Promise<void>,
    channel: Channel,
    queueName: string,
    bindingKey: string,
  ) {
    const message = JSON.parse(msg.content.toString()) as Message;
    Kernel.logger.info(
      `AMQP Message bus (${queueName}) handling message: ${JSON.stringify(message)}`,
    );
    try {
      const domainEvent = this.instanceDomainEvent(
        DomainEventInstance,
        message,
      );
      await handler(domainEvent);
    } catch (error) {
      await this.handleError(
        msg,
        message,
        channel,
        queueName,
        bindingKey,
        DomainEventInstance,
        handler,
        error,
      );
    }
  }

  private instanceDomainEvent(
    DomainEventInstance: new (...args: unknown[]) => DomainEvent,
    message: Message,
  ): DomainEvent {
    if (message) {
      const domainEvent = new DomainEventInstance(
        message.aggregate_id,
        message.attributes,
        message.event_id,
        message.occurred_on ? new Date(message.occurred_on) : new Date(),
      );

      return domainEvent;
    }
    throw new InvalidDomainEventError(JSON.stringify(message));
  }

  private async handleError(
    msg: ConsumeMessage,
    message: Message,
    channel: Channel,
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: (event: DomainEvent) => Promise<void>,
    error: unknown,
  ) {
    Kernel.logger.error((error as Error).message);
    const headers = msg.properties.headers;

    if (
      process.env.TRANSPORT_MAX_RETRIES &&
      (!headers.retries || headers.retries <= process.env.TRANSPORT_MAX_RETRIES)
    ) {
      await this.retry(
        message,
        headers,
        channel,
        queueName,
        bindingKey,
        DomainEventInstance,
        handler,
      );
    } else {
      await this.sendToDlx(
        message,
        channel,
        queueName,
        bindingKey,
        DomainEventInstance,
        error.toString(),
      );
    }
  }

  private async retry(
    message: Message,
    headers: MessagePropertyHeaders,
    channel: Channel,
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: (event: DomainEvent) => Promise<void>,
  ) {
    const retry = Number(headers.retries || 1);
    Kernel.logger.info(`Retry # ${retry}`);
    const delayTime: number = Number(process.env.TRANSPORT_RETRY_DELAY) || 1000;
    const delayTimeInMs = retry * delayTime;
    const delayedQueueName = `${queueName}_delayed_${delayTimeInMs}`;
    const delayedRoutingKey = `${queueName}_${bindingKey}_delayed_${delayTimeInMs}`;
    const index = this._delayConsumers.indexOf(delayedQueueName);
    const consumerTag = `${delayedQueueName}_${UUID.generate().valueOf()}`;

    if (index === -1) {
      await channel.assertExchange(this._exchange, 'topic', { durable: true });
      await channel.assertQueue(delayedQueueName, {
        deadLetterExchange: this._exchange,
        deadLetterRoutingKey: delayedRoutingKey,
        messageTtl: delayTimeInMs,
        durable: false,
        autoDelete: true,
      });
      await channel.bindQueue(
        delayedQueueName,
        this._exchange,
        delayedRoutingKey,
      );
      this._delayConsumers.push(delayedQueueName);
      await channel.consume(
        delayedQueueName,
        async (msg: ConsumeMessage) => {
          await new Promise((f) => setTimeout(f, delayTimeInMs));
          await this.handle(
            msg,
            DomainEventInstance,
            handler,
            channel,
            queueName,
            bindingKey,
          );
          const index = this._delayConsumers.indexOf(delayedQueueName);

          if (index !== -1) {
            this._delayConsumers.splice(index, 1);
          }
          await channel.cancel(consumerTag);
        },
        { noAck: true, consumerTag },
      );
    }
    try {
      const domainEvent = this.instanceDomainEvent(
        DomainEventInstance,
        message,
      );
      channel.publish(
        this._exchange,
        delayedRoutingKey,
        Buffer.from(JSON.stringify(message)),
        this.opts(domainEvent, retry),
      );
    } catch (error: unknown) {
      await channel.cancel(consumerTag);
      Kernel.logger.error((error as Error).message);
    }
  }

  private async sendToDlx(
    message: Message,
    channel: Channel,
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    error?: string,
  ): Promise<void> {
    await channel.assertExchange(this._exchange, 'topic');
    const dlxQueueName = `${queueName}_dlx`;
    const dlxRoutingKey = `${queueName}_${bindingKey}_dlx`;
    await channel.assertQueue(dlxQueueName, {
      deadLetterExchange: this._exchange,
      deadLetterRoutingKey: dlxRoutingKey,
      durable: true,
    });
    await channel.bindQueue(dlxQueueName, this._exchange, dlxRoutingKey);
    try {
      const domainEvent = this.instanceDomainEvent(
        DomainEventInstance,
        message,
      );
      channel.publish(
        this._exchange,
        dlxRoutingKey,
        Buffer.from(JSON.stringify(message)),
        this.opts(domainEvent, message.retries, error),
      );
    } catch (error: unknown) {
      Kernel.logger.error((error as Error).message);
    }
  }

  private async connect(): Promise<void> {
    const connection = await amqplib.connect(
      process.env.TRANSPORT_DSN,
      'heartbeat=60',
    );
    this._channel = await connection.createChannel();
    this._channel
      .on('close', async () => {
        Kernel.logger.error(`AMQP Message bus event close`);
        await this.reconnect();
      })
      .on('error', async (error) => {
        Kernel.logger.error(`AMQP Message bus event error: ${error.message}`);
        await this.reconnect();
      });
  }

  private async reconnect(): Promise<void> {
    await this.connect();
    for (const consumer of Kernel.consumers) {
      await consumer.init();
    }
  }

  private async channel(forceNew = false): Promise<Channel> {
    if (forceNew) {
      const connection = await amqplib.connect(
        process.env.TRANSPORT_DSN,
        'heartbeat=60',
      );

      return await connection.createChannel();
    }

    if (!this._channel) {
      await this.connect();
      this._exchange = `ms_${process.env.SERVICE_NAME}`;
      await this._channel.assertExchange(this._exchange, 'topic', {
        durable: true,
      });
    }

    return this._channel;
  }

  private opts(
    event: DomainEvent,
    retries?: number,
    error?: string,
  ): Options.Publish {
    return {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      priority: 0,
      messageId: event.eventId,
      timestamp: event.occurredOn.getTime(),
      type: event.eventName(),
      appId: process.env.SERVICE_NAME,
      deliveryMode: 2,
      headers: {
        error,
        retries: retries ? retries + 1 : 0,
      },
    };
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    const channel = await this.channel();
    domainEvents.forEach((event: DomainEvent) => {
      channel.publish(
        this._exchange,
        event.eventName(),
        Buffer.from(event.decode()),
        this.opts(event),
      );
    });
  }
}
