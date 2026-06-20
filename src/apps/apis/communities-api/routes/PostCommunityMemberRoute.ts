import CommunityMemberInviter from '@app/contexts/communities/application/invite-member/CommunityMemberInviter';
import { CommunityMemberInviteMessage } from '@app/contexts/communities/application/invite-member/messages/CommunityMemberInviteMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCommunityMemberBody } from '../bodies/PostCommunityMemberBody';
import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityMemberRoute extends CommunityRouteSupport {
  private readonly inviter = this.get<CommunityMemberInviter>(
    CommunityMemberInviter,
  );

  @Post('/:communityId/members')
  public async addMember(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityMemberBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const membershipRequest = await this.inviter.invite(
      new CommunityMemberInviteMessage(
        communityId,
        actorIdentityId.valueOf(),
        body.identityId,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
