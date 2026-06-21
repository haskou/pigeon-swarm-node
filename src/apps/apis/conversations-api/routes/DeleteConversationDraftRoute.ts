import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationDraftDeleter from '@app/contexts/conversations/application/manage-draft/ConversationDraftDeleter';
import { ConversationDraftDeleteMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftDeleteMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

@JsonController('/conversations')
export class DeleteConversationDraftRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly deleter = this.get<ConversationDraftDeleter>(
    ConversationDraftDeleter,
  );

  @Delete('/:conversationId/draft')
  public async deleteDraft(
    @Param('conversationId') conversationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);

    await this.deleter.delete(
      new ConversationDraftDeleteMessage(identityId.valueOf(), conversationId),
    );

    return response.status(HttpRouteStatusEnum.OK).send({ conversationId });
  }
}
