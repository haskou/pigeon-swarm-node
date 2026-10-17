import CommunityInvitationAdmitter from '@app/contexts/communities/application/admit-invitation/CommunityInvitationAdmitter';
import { CommunityInvitationAdmitMessage } from '@app/contexts/communities/application/admit-invitation/messages/CommunityInvitationAdmitMessage';
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

import { PostCommunityInvitationAdmissionBody } from '../bodies/PostCommunityInvitationAdmissionBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInvitationAdmissionRoute extends CommunityRouteSupport {
  private readonly admitter = this.get<CommunityInvitationAdmitter>(
    CommunityInvitationAdmitter,
  );

  @Post('/:communityId/invitations/:invitationId/admissions')
  public async admit(
    @Param('communityId') communityId: string,
    @Param('invitationId') invitationId: string,
    @Body() body: PostCommunityInvitationAdmissionBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.admitter.admit(
      new CommunityInvitationAdmitMessage(
        communityId,
        invitationId,
        actorIdentityId.valueOf(),
        {
          consent: body.consent,
          identityId: body.identityId,
          possession: body.possession,
        },
        body.operation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
