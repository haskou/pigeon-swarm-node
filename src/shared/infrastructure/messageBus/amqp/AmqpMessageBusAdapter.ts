import Kernel from '@app/Kernel';
import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { UUID } from '@haskou/value-objects';
import amqplib, {
  Channel,
  ConsumeMessage,
  MessagePropertyHeaders,
  Options,
} from 'amqplib';

import InvalidDomainEventError from '../../errors/InvalidDomainEventError';
import NoFailedMessagesError from '../../errors/NoFailedMessagesError';
import { Message } from '../Message';
import MessageBusAdapter from '../MessageBusAdapter';

export default class AmqpMessageBusAdapter implements MessageBusAdapter {
  private exchange!: string;
  private _channel!: Channel;
  private delayConsumers: string[] = [];

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

  // eslint-disable-next-line max-params
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
    const headers = msg.properties.headers ?? {};

    if (
      process.env.TRANSPORT_MAX_RETRIES &&
      (!headers?.retries ||
        headers?.retries <= process.env.TRANSPORT_MAX_RETRIES)
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
        error?.toString(),
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
    const index = this.delayConsumers.indexOf(delayedQueueName);
    const consumerTag = `${delayedQueueName}_${UUID.generate().valueOf()}`;

    if (index === -1) {
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      await channel.assertQueue(delayedQueueName, {
        autoDelete: true,
        deadLetterExchange: this.exchange,
        deadLetterRoutingKey: delayedRoutingKey,
        durable: false,
        messageTtl: delayTimeInMs,
      });
      await channel.bindQueue(
        delayedQueueName,
        this.exchange,
        delayedRoutingKey,
      );
      this.delayConsumers.push(delayedQueueName);
      await channel.consume(
        delayedQueueName,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            return;
          }
          await new Promise((f) => setTimeout(f, delayTimeInMs));
          await this.handle(
            msg,
            DomainEventInstance,
            handler,
            channel,
            queueName,
            bindingKey,
          );
          const index = this.delayConsumers.indexOf(delayedQueueName);

          if (index !== -1) {
            this.delayConsumers.splice(index, 1);
          }
          await channel.cancel(consumerTag);
        },
        { consumerTag, noAck: true },
      );
    }
    try {
      const domainEvent = this.instanceDomainEvent(
        DomainEventInstance,
        message,
      );
      channel.publish(
        this.exchange,
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
    await channel.assertExchange(this.exchange, 'topic');
    const dlxQueueName = `${queueName}_dlx`;
    const dlxRoutingKey = `${queueName}_${bindingKey}_dlx`;
    await channel.assertQueue(dlxQueueName, {
      deadLetterExchange: this.exchange,
      deadLetterRoutingKey: dlxRoutingKey,
      durable: true,
    });
    await channel.bindQueue(dlxQueueName, this.exchange, dlxRoutingKey);
    try {
      const domainEvent = this.instanceDomainEvent(
        DomainEventInstance,
        message,
      );
      channel.publish(
        this.exchange,
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
      process.env.TRANSPORT_DSN || '',
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
        process.env.TRANSPORT_DSN || '',
        'heartbeat=60',
      );

      return await connection.createChannel();
    }

    if (!this._channel) {
      await this.connect();
      this.exchange = `${process.env.SERVICE_NAME}`;
    }
    await this._channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });

    return this._channel;
  }

  private opts(
    event: DomainEvent,
    retries?: number,
    error?: string,
  ): Options.Publish {
    return {
      appId: process.env.SERVICE_NAME,
      contentEncoding: 'utf-8',
      contentType: 'application/json',
      deliveryMode: 2,
      headers: {
        error,
        retries: retries ? retries + 1 : 0,
      },
      messageId: event.eventId,
      priority: 0,
      timestamp: event.occurredOn.getTime(),
      type: event.eventName(),
    };
  }

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

  // eslint-disable-next-line sonarjs/cognitive-complexity
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
      // eslint-disable-next-line no-param-reassign
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
          // eslint-disable-next-line max-depth
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
          } catch (error: Error | unknown) {
            Kernel.logger.error(
              `${msg.content.toString()} error with ${(error as Error).message}.`,
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
    await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
      if (!msg) {
        return;
      }

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

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    const channel = await this.channel();
    domainEvents.forEach((event: DomainEvent) => {
      channel.publish(
        this.exchange,
        event.eventName(),
        Buffer.from(event.decode()),
        this.opts(event),
      );
    });
  }
}
