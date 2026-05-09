import CreateOneToOneConversation from '@app/contexts/conversations/application/create-one-to-one/CreateOneToOneConversation';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Body, JsonController, Post, Res } from 'routing-controllers';

import { PostOneToOneConversationBody } from '../bodies/PostOneToOneConversationBody';
import { PostOneToOneConversationRequest } from '../requests/PostOneToOneConversationRequest';
import { ConversationViewModel } from '../view-model/ConversationViewModel';

@JsonController('/conversations')
export class PostOneToOneConversationRoute extends Route {
  private readonly createOneToOneConversation = new CreateOneToOneConversation(
    new MongoConversationRepository(this.get<MongoDB>(MongoDB)),
  );

  @Post('/1to1')
  public async createConversation(
    @Body() body: PostOneToOneConversationBody,
    @Res() response: Response,
  ): Promise<Response> {
    const request = new PostOneToOneConversationRequest(body);
    const conversation = await this.createOneToOneConversation.create(
      request.getMessage(),
    );
    const viewModel = new ConversationViewModel(conversation);

    return response.status(HttpRouteStatusEnum.OK).send(viewModel.toResource());
  }
}
