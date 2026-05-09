import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import OneToOneConversationCreator from '@app/contexts/conversations/application/create-one-to-one/OneToOneConversationCreator';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostConversationBody } from '../bodies/PostConversationBody';
import { PostConversationRequest } from '../requests/PostConversationRequest';
import { ConversationViewModel } from '../view-model/ConversationViewModel';

@JsonController('/conversations')
export class PostConversationRoute extends Route {
  private readonly creator: OneToOneConversationCreator =
    this.get<OneToOneConversationCreator>(OneToOneConversationCreator);

  private readonly signedRequestVerifier = new SignedHttpRequestVerifier();

  @Post('/')
  public async createConversation(
    @Body() body: PostConversationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = this.signedRequestVerifier.verify(request);
    const conversation = await this.creator.create(
      new PostConversationRequest(body, ownerIdentityId).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationViewModel(conversation).toResource());
  }
}
