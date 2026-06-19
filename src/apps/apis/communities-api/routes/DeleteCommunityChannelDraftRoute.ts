import CommunityChannelDraftRepository from '@app/contexts/communities/domain/repositories/CommunityChannelDraftRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelDraftRoute extends CommunityRouteSupport {
  private readonly draftRepository = this.get<CommunityChannelDraftRepository>(
    CommunityChannelDraftRepository,
  );

  @Delete('/:communityId/channels/:channelId/draft')
  public async deleteDraft(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const domainCommunityId = new CommunityId(communityId);
    const domainChannelId = new CommunityChannelId(channelId);

    community.viewTextChannel(actorIdentityId, domainChannelId);
    await this.draftRepository.delete(
      actorIdentityId,
      domainCommunityId,
      domainChannelId,
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
    });
  }
}
