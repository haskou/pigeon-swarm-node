import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationDraftSaver from '@app/contexts/conversations/application/manage-draft/ConversationDraftSaver';
import { ConversationDraftSaveMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftSaveMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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
import { ConversationDraftResource } from '../resources/ConversationDraftResource';

@JsonController('/conversation-drafts')
export class PutConversationDraftRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly saver = this.get<ConversationDraftSaver>(
    ConversationDraftSaver,
  );

  @Put('/:draftKey')
  public async saveDraft(
    @Param('draftKey') draftKey: string,
    @Body() body: PutConversationDraftBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const message = new ConversationDraftSaveMessage(
      identityId.valueOf(),
      draftKey,
      body.encryptedPayload,
      body.updatedAt,
    );

    await this.saver.save(message);

    const resource: ConversationDraftResource = {
      draftKey: message.draftKey.valueOf(),
      encryptedPayload: message.encryptedPayload.valueOf(),
      updatedAt: message.updatedAt.valueOf(),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
