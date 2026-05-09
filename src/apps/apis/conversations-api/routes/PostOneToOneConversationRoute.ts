import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import OneToOneConversationCreator from '@app/contexts/conversations/application/create-one-to-one/OneToOneConversationCreator';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostOneToOneConversationBody } from '../bodies/PostOneToOneConversationBody';
import { PostOneToOneConversationRequest } from '../requests/PostOneToOneConversationRequest';
import { ConversationViewModel } from '../view-model/ConversationViewModel';

@JsonController('/conversations')
export class PostOneToOneConversationRoute extends Route {
  private readonly creator: OneToOneConversationCreator =
    this.get<OneToOneConversationCreator>(OneToOneConversationCreator);

  private readonly signedRequestVerifier = new SignedHttpRequestVerifier();

  @Post('/1to1')
  public async createOneToOneConversation(
    @Body() body: PostOneToOneConversationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = this.signedRequestVerifier.verify(request);
    const conversation = await this.creator.create(
      new PostOneToOneConversationRequest(body, ownerIdentityId).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationViewModel(conversation).toResource());
  }
}
