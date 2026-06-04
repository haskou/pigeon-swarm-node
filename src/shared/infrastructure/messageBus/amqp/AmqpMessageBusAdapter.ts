import Kernel from '@app/Kernel';
import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { UUID } from '@haskou/value-objects';
import amqplib, {
  Channel,
  ConsumeMessage,
  GetMessage,
  MessagePropertyHeaders,
  Options,
} from 'amqplib';

import InvalidDomainEventError from '../../errors/InvalidDomainEventError';
import NoFailedMessagesError from '../../errors/NoFailedMessagesError';
import { Message } from '../Message';
import MessageBusAdapter from '../MessageBusAdapter';

type DomainEventHandler = (event: DomainEvent) => Promise<void>;

type ConsumerContext = {
  bindingKey: string;
  channel: Channel;
  DomainEventInstance: Constructor<DomainEvent>;
  handler: DomainEventHandler;
  queueName: string;
};

export default class AmqpMessageBusAdapter implements MessageBusAdapter {
  private exchange!: string;
  private _channel!: Channel;
  private delayConsumers: string[] = [];

  private async handle(msg: ConsumeMessage, context: ConsumerContext) {
    const message = JSON.parse(msg.content.toString()) as Message;
    Kernel.logger.info(
      `AMQP Message bus (${context.queueName}) handling message: ${JSON.stringify(message)}`,
    );
    try {
      const domainEvent = this.instanceDomainEvent(
        context.DomainEventInstance,
        message,
      );
      await context.handler(domainEvent);
    } catch (error) {
      await this.handleError(msg, message, context, error);
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
    context: ConsumerContext,
    error: unknown,
  ) {
    Kernel.logger.error((error as Error).message);
    const headers = msg.properties.headers ?? {};

    if (
      process.env.TRANSPORT_MAX_RETRIES &&
      (!headers?.retries ||
        headers?.retries <= process.env.TRANSPORT_MAX_RETRIES)
    ) {
      await this.retry(message, headers, context);
    } else {
      await this.sendToDlx(message, context, error?.toString());
    }
  }

  private async retry(
    message: Message,
    headers: MessagePropertyHeaders,
    context: ConsumerContext,
  ) {
    const retry = Number(headers.retries || 1);
    Kernel.logger.info(`Retry # ${retry}`);
    const delayTime: number = Number(process.env.TRANSPORT_RETRY_DELAY) || 1000;
    const delayTimeInMs = retry * delayTime;
    const delayedQueueName = `${context.queueName}_delayed_${delayTimeInMs}`;
    const delayedRoutingKey = `${context.queueName}_${context.bindingKey}_delayed_${delayTimeInMs}`;
    const index = this.delayConsumers.indexOf(delayedQueueName);
    const consumerTag = `${delayedQueueName}_${UUID.generate().valueOf()}`;

    if (index === -1) {
      await context.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });
      await context.channel.assertQueue(delayedQueueName, {
        autoDelete: true,
        deadLetterExchange: this.exchange,
        deadLetterRoutingKey: delayedRoutingKey,
        durable: false,
        messageTtl: delayTimeInMs,
      });
      await context.channel.bindQueue(
        delayedQueueName,
        this.exchange,
        delayedRoutingKey,
      );
      this.delayConsumers.push(delayedQueueName);
      await context.channel.consume(
        delayedQueueName,
        async (msg: ConsumeMessage | null) => {
          if (!msg) {
            return;
          }
          await new Promise((f) => setTimeout(f, delayTimeInMs));
          await this.handle(msg, context);
          const index = this.delayConsumers.indexOf(delayedQueueName);

          if (index !== -1) {
            this.delayConsumers.splice(index, 1);
          }
          await context.channel.cancel(consumerTag);
        },
        { consumerTag, noAck: true },
      );
    }
    try {
      const domainEvent = this.instanceDomainEvent(
        context.DomainEventInstance,
        message,
      );
      context.channel.publish(
        this.exchange,
        delayedRoutingKey,
        Buffer.from(JSON.stringify(message)),
        this.opts(domainEvent, retry),
      );
    } catch (error: unknown) {
      await context.channel.cancel(consumerTag);
      Kernel.logger.error((error as Error).message);
    }
  }

  private async sendToDlx(
    message: Message,
    context: ConsumerContext,
    error?: string,
  ): Promise<void> {
    await context.channel.assertExchange(this.exchange, 'topic');
    const dlxQueueName = `${context.queueName}_dlx`;
    const dlxRoutingKey = `${context.queueName}_${context.bindingKey}_dlx`;
    await context.channel.assertQueue(dlxQueueName, {
      deadLetterExchange: this.exchange,
      deadLetterRoutingKey: dlxRoutingKey,
      durable: true,
    });
    await context.channel.bindQueue(dlxQueueName, this.exchange, dlxRoutingKey);
    try {
      const domainEvent = this.instanceDomainEvent(
        context.DomainEventInstance,
        message,
      );
      context.channel.publish(
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

  private getMessagesToRetry(
    requestedMessagesToRetry: number | undefined,
    availableMessages: number,
  ): number {
    return requestedMessagesToRetry ?? availableMessages;
  }

  private async retryDlxMessage(
    msg: ConsumeMessage | GetMessage,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: (event: DomainEvent) => Promise<void>,
    channel: Channel,
  ): Promise<void> {
    const content = msg.content.toString();

    Kernel.logger.info(`Retrying message from DLX ${content}`);

    try {
      const message = JSON.parse(content) as Message;
      const domainEvent = this.instanceDomainEvent(
        DomainEventInstance,
        message,
      );

      await handler(domainEvent);
      Kernel.logger.info(`${content} succesfully handled.`);
      channel.ack(msg);
    } catch (error: Error | unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      Kernel.logger.error(`${content} error with ${errorMessage}.`);
      channel.nack(msg);
    }
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
    const messagesToRetryCount = this.getMessagesToRetry(
      messagesToRetry,
      queue.messageCount,
    );

    Kernel.logger.info(
      `Retrying ${messagesToRetryCount} messages from DLX ${dlxQueueName}`,
    );

    if (messagesToRetryCount > 0 && queue.messageCount !== 0) {
      for (let index = 0; index < messagesToRetryCount; index++) {
        const msg = await channel.get(dlxQueueName);

        if (msg === false) {
          continue;
        }

        await this.retryDlxMessage(msg, DomainEventInstance, handler, channel);
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
    const context: ConsumerContext = {
      bindingKey,
      channel,
      DomainEventInstance,
      handler,
      queueName,
    };

    await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
      if (!msg) {
        return;
      }

      await this.handle(msg, context);
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
