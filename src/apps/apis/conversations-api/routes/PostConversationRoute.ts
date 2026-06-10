import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import GroupConversationCreator from '@app/contexts/conversations/application/create-group/GroupConversationCreator';
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

  private readonly groupCreator: GroupConversationCreator =
    this.get<GroupConversationCreator>(GroupConversationCreator);

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
    const conversationRequest = new PostConversationRequest(
      body,
      ownerIdentityId,
    );
    const conversation =
      body.type === 'group'
        ? await this.groupCreator.create(conversationRequest.getGroupMessage())
        : await this.creator.create(conversationRequest.getOneToOneMessage());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationViewModel(conversation).toResource());
  }
}
