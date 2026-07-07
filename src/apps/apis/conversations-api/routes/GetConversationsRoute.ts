import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationUnreadCounter from '@app/contexts/conversations/application/count-unread-conversations/ConversationUnreadCounter';
import { ConversationsUnreadCountMessage } from '@app/contexts/conversations/application/count-unread-conversations/messages/ConversationsUnreadCountMessage';
import ConversationsFinder from '@app/contexts/conversations/application/find-conversations/ConversationsFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetConversationsRequest } from '../requests/GetConversationsRequest';
import { ConversationsViewModel } from '../view-model/ConversationsViewModel';

@JsonController('/conversations')
export class GetConversationsRoute extends Route {
  private readonly finder: ConversationsFinder =
    this.get<ConversationsFinder>(ConversationsFinder);

  private readonly unreadCounter = this.get<ConversationUnreadCounter>(
    ConversationUnreadCounter,
  );

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
    const unreadCounts = await this.unreadCounter.count(
      new ConversationsUnreadCountMessage(
        requesterIdentityId.valueOf(),
        conversations.map((conversation) => conversation.getId().valueOf()),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new ConversationsViewModel(conversations, unreadCounts).toResource(),
      );
  }
}
