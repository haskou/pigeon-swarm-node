import CommunityChannelDraftDeleter from '@app/contexts/communities/application/manage-channel-draft/CommunityChannelDraftDeleter';
import { CommunityChannelDraftDeleteMessage } from '@app/contexts/communities/application/manage-channel-draft/messages/CommunityChannelDraftDeleteMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelDraftRoute extends CommunityRouteSupport {
  private readonly deleter = this.get<CommunityChannelDraftDeleter>(
    CommunityChannelDraftDeleter,
  );

  @Delete('/:communityId/channels/:channelId/draft')
  public async deleteDraft(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    await this.deleter.delete(
      new CommunityChannelDraftDeleteMessage(
        actorIdentityId.valueOf(),
        communityId,
        channelId,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
    });
  }
}
