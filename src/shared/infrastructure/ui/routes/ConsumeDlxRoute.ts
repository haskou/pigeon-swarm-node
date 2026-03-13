import Kernel from '@app/Kernel';
import {
  Post,
  JsonController,
  OnUndefined,
  HeaderParam,
  UnauthorizedError,
  Param,
  QueryParam,
  BadRequestError,
  NotFoundError,
} from 'routing-controllers';

import HandlerNotFoundError from '../../errors/HandlerNotFoundError';
import NoFailedMessagesError from '../../errors/NoFailedMessagesError';
import AmqpMessageBusAdapter from '../../messageBus/amqp/AmqpMessageBusAdapter';
import MessageBusAdapter from '../../messageBus/MessageBusAdapter';
import Consumer from '../consumers/Consumer';
import Route from './Route';

@JsonController()
export default class ConsumeDlxRoute extends Route {
  public get messageBusAdapter(): MessageBusAdapter {
    return this.get(AmqpMessageBusAdapter) as MessageBusAdapter;
  }

  public getHandler(queueName: string): Consumer {
    try {
      return Kernel.consumers.find((c) => c.queueName === queueName);
    } catch (error) {
      throw new HandlerNotFoundError(queueName);
    }
  }

  @OnUndefined(202)
  @Post('/consume-dlx/:queue')
  public async execute(
    @HeaderParam('secret-api-key') token: string,
    @Param('queue') queueName: string,
    @QueryParam('messagesToRetry') messagesToRetry?: number,
  ): Promise<void> {
    if (token !== 'db45bf02-9851-4079-80e6-af883f991595') {
      throw new UnauthorizedError();
    }
    try {
      const handler = this.getHandler(queueName);
      await this.messageBusAdapter.consumeDlx(
        handler.queueName,
        handler.domainEvent,
        handler.handler.bind(handler) as (message: never) => Promise<void>,
        messagesToRetry,
      );
    } catch (error) {
      if (error instanceof HandlerNotFoundError) {
        throw new NotFoundError(error.message);
      }

      if (
        error instanceof NoFailedMessagesError ||
        error instanceof HandlerNotFoundError
      ) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }
  }
}
