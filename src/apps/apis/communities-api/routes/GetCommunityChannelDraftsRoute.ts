import CommunityChannelDraftRepository from '@app/contexts/communities/domain/repositories/CommunityChannelDraftRepository';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelDraftsRoute extends CommunityRouteSupport {
  private readonly draftRepository = this.get<CommunityChannelDraftRepository>(
    CommunityChannelDraftRepository,
  );

  @Get('/me/drafts')
  public async listDrafts(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const drafts = await this.draftRepository.findByIdentity(identityId);

    return response.status(HttpRouteStatusEnum.OK).send({
      drafts: drafts.map((draft) => ({
        channelId: draft.channelId,
        communityId: draft.communityId,
        encryptedPayload: draft.encryptedPayload,
        updatedAt: draft.updatedAt,
      })),
    });
  }
}
