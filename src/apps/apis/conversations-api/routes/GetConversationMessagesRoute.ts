import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import LatestMessagesFinder from '@app/contexts/conversations/application/find-latest-messages/LatestMessagesFinder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { GetConversationMessagesRequest } from '../requests/GetConversationMessagesRequest';
import { MessagesViewModel } from '../view-model/MessagesViewModel';

@JsonController('/conversations')
export class GetConversationMessagesRoute extends Route {
  private readonly finder: LatestMessagesFinder =
    this.get<LatestMessagesFinder>(LatestMessagesFinder);

  private readonly signedRequestVerifier = new SignedHttpRequestVerifier();

  @Get('/:conversationId/messages')
  public async getMessages(
    @Param('conversationId') conversationId: string,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('beforeMessageId') beforeMessageId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = this.signedRequestVerifier.verify(request);
    const messages = await this.finder.find(
      new GetConversationMessagesRequest(
        conversationId,
        requesterIdentityId,
        limit,
        beforeMessageId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MessagesViewModel(conversationId, messages).toResource());
  }
}
