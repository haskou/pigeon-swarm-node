import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationDraftDeleter from '@app/contexts/conversations/application/manage-draft/ConversationDraftDeleter';
import ConversationDraftSaver from '@app/contexts/conversations/application/manage-draft/ConversationDraftSaver';
import ConversationDraftsFinder from '@app/contexts/conversations/application/manage-draft/ConversationDraftsFinder';
import { ConversationDraftDeleteMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftDeleteMessage';
import { ConversationDraftSaveMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftSaveMessage';
import { ConversationDraftsFindMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftsFindMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  Get,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutConversationDraftBody } from '../bodies/PutConversationDraftBody';

@JsonController('/conversations')
export class ConversationDraftsRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly deleter = this.get<ConversationDraftDeleter>(
    ConversationDraftDeleter,
  );

  private readonly finder = this.get<ConversationDraftsFinder>(
    ConversationDraftsFinder,
  );

  private readonly saver = this.get<ConversationDraftSaver>(
    ConversationDraftSaver,
  );

  @Get('/me/drafts')
  public async listDrafts(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const drafts = await this.finder.find(
      new ConversationDraftsFindMessage(identityId.valueOf()),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      drafts: drafts.map((draft) => ({
        conversationId: draft.conversationId,
        encryptedPayload: draft.encryptedPayload,
        updatedAt: draft.updatedAt,
      })),
    });
  }

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
