import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationDraftsFinder from '@app/contexts/conversations/application/manage-draft/ConversationDraftsFinder';
import { ConversationDraftsFindMessage } from '@app/contexts/conversations/application/manage-draft/messages/ConversationDraftsFindMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

@JsonController('/conversations')
export class GetConversationDraftsRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly finder = this.get<ConversationDraftsFinder>(
    ConversationDraftsFinder,
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
        conversationId: draft.getConversationId().valueOf(),
        encryptedPayload: draft.getEncryptedPayload().valueOf(),
        updatedAt: draft.getUpdatedAt().valueOf(),
      })),
    });
  }
}
