import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationDraftsFinder from '@app/contexts/conversations/application/manage-draft/ConversationDraftsFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetConversationDraftsRequest } from '../requests/GetConversationDraftsRequest';
import { ConversationDraftsResource } from '../resources/ConversationDraftsResource';

@JsonController('/conversation-drafts')
export class GetConversationDraftsRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly finder = this.get<ConversationDraftsFinder>(
    ConversationDraftsFinder,
  );

  @Get()
  public async listDrafts(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const pageRequest = new GetConversationDraftsRequest(
      identityId,
      limit,
      cursor,
    );
    const page = await this.finder.find(pageRequest.getMessage());

    const resource: ConversationDraftsResource = {
      drafts: page.items.map((draft) => ({
        draftKey: draft.getDraftKey().valueOf(),
        encryptedPayload: draft.getEncryptedPayload().valueOf(),
        updatedAt: draft.getUpdatedAt().valueOf(),
      })),
      nextCursor: pageRequest.nextCursor(page.nextPosition),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
