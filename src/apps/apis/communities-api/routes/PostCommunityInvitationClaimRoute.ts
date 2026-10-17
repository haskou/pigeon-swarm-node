import CommunityInvitationClaimer from '@app/contexts/communities/application/claim-invitation/CommunityInvitationClaimer';
import { CommunityInvitationClaimMessage } from '@app/contexts/communities/application/claim-invitation/messages/CommunityInvitationClaimMessage';
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

import { PostCommunityInvitationClaimBody } from '../bodies/PostCommunityInvitationClaimBody';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInvitationClaimRoute extends CommunityRouteSupport {
  private readonly claimer = this.get<CommunityInvitationClaimer>(
    CommunityInvitationClaimer,
  );

  @Post('/:communityId/invitations/:invitationId/claims')
  public async claimInvitation(
    @Param('communityId') communityId: string,
    @Param('invitationId') invitationId: string,
    @Body() body: PostCommunityInvitationClaimBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const claim = await this.claimer.claim(
      new CommunityInvitationClaimMessage(
        communityId,
        invitationId,
        identityId.valueOf(),
        { consent: body.consent, possession: body.possession },
        body.mutation,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send(claim.toPrimitives());
  }
}
