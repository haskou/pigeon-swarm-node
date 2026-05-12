import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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
  @Patch('/:communityId/channels/:channelId')
  public async renameChannel(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PatchCommunityChannelBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.renameTextChannel(
      actorIdentityId,
      new CommunityChannelId(channelId),
      new CommunityChannelName(body.name),
    );
    await this.repository().save(community);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
