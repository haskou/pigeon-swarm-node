import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { Channel } from 'amqplib';

import { DomainEventHandler } from './DomainEventHandler';

export type ConsumerContext = {
  bindingKey: string;
  channel: Channel;
  DomainEventInstance: Constructor<DomainEvent>;
  handler: DomainEventHandler;
  queueName: string;
};
