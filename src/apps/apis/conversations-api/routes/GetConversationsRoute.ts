import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
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

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Get('/')
  public async getConversations(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('beforeConversationId')
    beforeConversationId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const conversations = await this.finder.find(
      new GetConversationsRequest(
        requesterIdentityId,
        limit,
        beforeConversationId,
      ).getMessage(),
    );
    const unreadCounts = await this.finder.countUnread(
      requesterIdentityId,
      conversations,
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new ConversationsViewModel(conversations, unreadCounts).toResource(),
      );
  }
}
