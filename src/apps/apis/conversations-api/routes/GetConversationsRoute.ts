import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import ConversationsFinder from '@app/contexts/conversations/application/find-conversations/ConversationsFinder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetConversationsRequest } from '../requests/GetConversationsRequest';
import { ConversationsViewModel } from '../view-model/ConversationsViewModel';

@JsonController('/conversations')
export class GetConversationsRoute extends Route {
  private readonly finder: ConversationsFinder =
    this.get<ConversationsFinder>(ConversationsFinder);

  private readonly signedRequestVerifier = new SignedHttpRequestVerifier();

  @Get('/')
  public async getConversations(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('beforeConversationId')
    beforeConversationId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = this.signedRequestVerifier.verify(request);
    const conversations = await this.finder.find(
      new GetConversationsRequest(
        requesterIdentityId,
        limit,
        beforeConversationId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationsViewModel(conversations).toResource());
  }
}
