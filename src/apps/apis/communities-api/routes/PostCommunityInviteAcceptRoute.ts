import { CommunityInviteNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInviteNotFoundError';
import { CommunityInviteWasAcceptedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasAcceptedEvent';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInviteAcceptRoute extends CommunityRouteSupport {
  @Post('/invites/:inviteToken/accept')
  public async acceptInvite(
    @Param('inviteToken') inviteToken: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const invite = await this.inviteRepository().findByToken(
      new CommunityInviteToken(inviteToken),
    );

    if (!invite) {
      throw new CommunityInviteNotFoundError();
    }

    const communityId = invite.getCommunityId().valueOf();
    const community = await this.findCommunity(communityId);

    community.assertIsNotBanned(actorIdentityId);
    const acceptedInvite = await this.inviteRepository().consume(invite);
    community.joinWithInvite(actorIdentityId);
    await this.repository().save(community);
    await this.eventPublisher.publish([
      new CommunityInviteWasAcceptedEvent(acceptedInvite.getToken().valueOf(), {
        communityId: community.getId().valueOf(),
        identityId: actorIdentityId.valueOf(),
        invite: acceptedInvite.toPrimitives(),
        networkId: community.getNetworkId().valueOf(),
      }),
      ...community.pullDomainEvents(),
    ]);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
