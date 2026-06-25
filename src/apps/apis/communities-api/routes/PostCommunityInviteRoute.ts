import CommunityInviteCreator from '@app/contexts/communities/application/create-invite/CommunityInviteCreator';
import { CommunityInviteCreateMessage } from '@app/contexts/communities/application/create-invite/messages/CommunityInviteCreateMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCommunityInviteBody } from '../bodies/PostCommunityInviteBody';
import { CommunityInviteViewModel } from '../view-model/CommunityInviteViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInviteRoute extends CommunityRouteSupport {
  private readonly creator = this.get<CommunityInviteCreator>(
    CommunityInviteCreator,
  );

  @Post('/:communityId/invites')
  public async createInvite(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityInviteBody | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const invite = await this.creator.create(
      new CommunityInviteCreateMessage(
        communityId,
        actorIdentityId.valueOf(),
        body?.expiresAt,
        body?.maxUses,
        body?.encryptedCommunityKey,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityInviteViewModel(invite).toResource());
  }
}
