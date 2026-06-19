import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationDraftSaver from '@app/contexts/conversations/application/manage-draft/ConversationDraftSaver';
import { ConversationDraftSaveMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftSaveMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutConversationDraftBody } from '../bodies/PutConversationDraftBody';

@JsonController('/conversations')
export class PutConversationDraftRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly saver = this.get<ConversationDraftSaver>(
    ConversationDraftSaver,
  );

  @Put('/:conversationId/draft')
  public async saveDraft(
    @Param('conversationId') conversationId: string,
    @Body() body: PutConversationDraftBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const message = new ConversationDraftSaveMessage(
      identityId.valueOf(),
      conversationId,
      body.encryptedPayload,
      body.updatedAt,
    );

    await this.saver.save(message);

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      encryptedPayload: body.encryptedPayload,
      updatedAt: message.updatedAt.valueOf(),
    });
  }
}
