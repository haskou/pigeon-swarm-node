import CommunityInvitationCreator from '@app/contexts/communities/application/create-invitation/CommunityInvitationCreator';
import { CommunityInvitationCreateMessage } from '@app/contexts/communities/application/create-invitation/messages/CommunityInvitationCreateMessage';
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

import { PostCommunityInvitationBody } from '../bodies/PostCommunityInvitationBody';
import { CommunityInvitationViewModel } from '../view-model/CommunityInvitationViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInvitationRoute extends CommunityRouteSupport {
  private readonly creator = this.get<CommunityInvitationCreator>(
    CommunityInvitationCreator,
  );

  @Post('/:communityId/invitations')
  public async createInvitation(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityInvitationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const { community, invitation } = await this.creator.create(
      new CommunityInvitationCreateMessage(
        communityId,
        actorIdentityId.valueOf(),
        {
          expiresAt: body.expiresAt,
          invitationKey: body.invitationKey,
          invitee: body.invitee,
          maxUses: body.maxUses,
        },
        body.moderationLog,
        body.operation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityInvitationViewModel(community, invitation).toResource(),
      );
  }
}
