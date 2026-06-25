import CommunityChannelDeleter from '@app/contexts/communities/application/delete-channel/CommunityChannelDeleter';
import { CommunityChannelDeleteMessage } from '@app/contexts/communities/application/delete-channel/messages/CommunityChannelDeleteMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelRoute extends CommunityRouteSupport {
  private readonly deleter = this.get<CommunityChannelDeleter>(
    CommunityChannelDeleter,
  );

  @Delete('/:communityId/channels/:channelId')
  public async deleteChannel(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.deleter.delete(
      new CommunityChannelDeleteMessage(
        communityId,
        channelId,
        actorIdentityId.valueOf(),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
