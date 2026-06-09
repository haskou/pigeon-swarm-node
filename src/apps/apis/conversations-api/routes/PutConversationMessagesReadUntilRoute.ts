import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MessagesReadMarker from '@app/contexts/conversations/application/mark-messages-read/MessagesReadMarker';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutConversationMessagesReadUntilBody } from '../bodies/PutConversationMessagesReadUntilBody';
import { PutConversationMessagesReadUntilRequest } from '../requests/PutConversationMessagesReadUntilRequest';

@JsonController('/conversations')
export class PutConversationMessagesReadUntilRoute extends Route {
  private readonly marker = new MessagesReadMarker(
    new OrbitDBConversationRepository(),
    this.get<DomainEventPublisher>(MessageBus),
  );

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Put('/:conversationId/messages/read-until')
  public async markMessagesReadUntil(
    @Param('conversationId') conversationId: string,
    @Body() body: PutConversationMessagesReadUntilBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const readerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    await this.marker.mark(
      new PutConversationMessagesReadUntilRequest(
        conversationId,
        body,
        readerIdentityId,
      ).getMessage(),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      status: 'read',
    });
  }
}
