import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationCreator from '@app/contexts/conversations/application/create-conversation/ConversationCreator';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostConversationBody } from '../bodies/PostConversationBody';
import { PostConversationRequest } from '../requests/PostConversationRequest';
import { ConversationViewModel } from '../view-model/ConversationViewModel';

@JsonController('/conversations')
export class PostConversationRoute extends Route {
  private readonly creator: ConversationCreator =
    this.get<ConversationCreator>(ConversationCreator);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Post('/')
  public async createConversation(
    @Body() body: PostConversationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const conversation = await this.creator.create(
      new PostConversationRequest(body, ownerIdentityId).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationViewModel(conversation).toResource());
  }
}
