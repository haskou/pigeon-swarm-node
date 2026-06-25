import CommunityMembershipRequestUpdater from '@app/contexts/communities/application/update-membership-request/CommunityMembershipRequestUpdater';
import { CommunityMembershipRequestUpdateMessage } from '@app/contexts/communities/application/update-membership-request/messages/CommunityMembershipRequestUpdateMessage';
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

import { PatchCommunityMembershipRequestBody } from '../bodies/PatchCommunityMembershipRequestBody';
import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PatchCommunityRequestRoute extends CommunityRouteSupport {
  private readonly updater = this.get<CommunityMembershipRequestUpdater>(
    CommunityMembershipRequestUpdater,
  );

  @Patch('/membership-requests/:requestId')
  public async updateMembershipRequest(
    @Param('requestId') requestId: string,
    @Body() body: PatchCommunityMembershipRequestBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const membershipRequest = await this.updater.update(
      new CommunityMembershipRequestUpdateMessage(
        requestId,
        actorIdentityId.valueOf(),
        body.status,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
