import CommunityInvitationRevoker from '@app/contexts/communities/application/revoke-invitation/CommunityInvitationRevoker';
import { CommunityInvitationRevokeMessage } from '@app/contexts/communities/application/revoke-invitation/messages/CommunityInvitationRevokeMessage';
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

import { PostCommunityInvitationRevocationBody } from '../bodies/PostCommunityInvitationRevocationBody';
import { CommunityInvitationViewModel } from '../view-model/CommunityInvitationViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInvitationRevocationRoute extends CommunityRouteSupport {
  private readonly revoker = this.get<CommunityInvitationRevoker>(
    CommunityInvitationRevoker,
  );

  @Post('/:communityId/invitations/:invitationId/revocation')
  public async revoke(
    @Param('communityId') communityId: string,
    @Param('invitationId') invitationId: string,
    @Body() body: PostCommunityInvitationRevocationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const { community, invitation } = await this.revoker.revoke(
      new CommunityInvitationRevokeMessage(
        communityId,
        invitationId,
        actorIdentityId.valueOf(),
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
