import CommunityChannelDraftsFinder from '@app/contexts/communities/application/manage-channel-draft/CommunityChannelDraftsFinder';
import { CommunityChannelDraftsFindMessage } from '@app/contexts/communities/application/manage-channel-draft/messages/CommunityChannelDraftsFindMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelDraftsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelDraftsFinder>(
    CommunityChannelDraftsFinder,
  );

  @Get('/me/drafts')
  public async listDrafts(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const drafts = await this.finder.find(
      new CommunityChannelDraftsFindMessage(identityId.valueOf()),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      drafts: drafts.map((draft) => ({
        channelId: draft.getChannelId().valueOf(),
        communityId: draft.getCommunityId().valueOf(),
        encryptedPayload: draft.getEncryptedPayload().valueOf(),
        updatedAt: draft.getUpdatedAt().valueOf(),
      })),
    });
  }
}
