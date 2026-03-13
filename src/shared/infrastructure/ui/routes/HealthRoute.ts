import Kernel from '@app/Kernel';
import { Response } from 'express';
import {
  Get as get,
  JsonController as jsonController,
  Res,
} from 'routing-controllers';

import AmqpMessageBusAdapter from '../../messageBus/amqp/AmqpMessageBusAdapter';
import MessageBus from '../../messageBus/MessageBus';
import Route from './Route';

@jsonController()
export default class HealthRoute extends Route {
  public get rabbit(): AmqpMessageBusAdapter {
    return this.get(AmqpMessageBusAdapter) as AmqpMessageBusAdapter;
  }

  @get('/health')
  public async health(@Res() res: Response): Promise<object> {
    if (await this.rabbit.areQueuesBound()) {
      Kernel.logger.error(`Health error with queues binding!`);

      return res.status(503).send().end();
    }

    return res.status(200).send().end();
  }

  @get('/')
  public index(): object {
    return {};
  }

  public get eventBus(): MessageBus {
    return this.get<MessageBus>(
      'shared.infrastructure.message_bus.message_bus',
    );
  }
}
