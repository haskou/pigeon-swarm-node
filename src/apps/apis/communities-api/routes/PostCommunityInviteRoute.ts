import { CommunityInvite } from '@app/contexts/communities/domain/CommunityInvite';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Timestamp } from '@haskou/value-objects';
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
  @Post('/:communityId/invites')
  public async createInvite(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityInviteBody | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.assertCanCreateInvite(actorIdentityId);

    const invite = CommunityInvite.create(
      community.getId(),
      actorIdentityId,
      body?.expiresAt ? new Timestamp(body.expiresAt) : undefined,
      body?.maxUses ? new CommunityInviteMaxUses(body.maxUses) : undefined,
    );

    await this.inviteRepository().save(invite);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityInviteViewModel(invite).toResource());
  }
}
