import CommunityChannelRenamer from '@app/contexts/communities/application/rename-channel/CommunityChannelRenamer';
import { CommunityChannelRenameMessage } from '@app/contexts/communities/application/rename-channel/messages/CommunityChannelRenameMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchCommunityChannelBody } from '../bodies/PatchCommunityChannelBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PatchCommunityChannelRoute extends CommunityRouteSupport {
  private readonly renamer = this.get<CommunityChannelRenamer>(
    CommunityChannelRenamer,
  );

  @Patch('/:communityId/channels/:channelId')
  public async renameChannel(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PatchCommunityChannelBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.renamer.rename(
      new CommunityChannelRenameMessage(
        communityId,
        channelId,
        actorIdentityId.valueOf(),
        body.name,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
