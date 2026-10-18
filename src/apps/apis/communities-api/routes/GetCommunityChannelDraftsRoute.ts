import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityChannelDraftsFinder from '@app/contexts/communities/application/manage-channel-draft/CommunityChannelDraftsFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetCommunityChannelDraftsRequest } from '../requests/GetCommunityChannelDraftsRequest';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/community-drafts')
export class GetCommunityChannelDraftsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelDraftsFinder>(
    CommunityChannelDraftsFinder,
  );

  @Get()
  public async listDrafts(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityChannelDraftsRequest(
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send({
      drafts: page.getItems().map((draft) => ({
        channelId: draft.getChannelId().valueOf(),
        communityId: draft.getCommunityId().valueOf(),
        encryptedPayload: draft.getEncryptedPayload().valueOf(),
        updatedAt: draft.getUpdatedAt().valueOf(),
      })),
      nextCursor:
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
    });
  }
}
