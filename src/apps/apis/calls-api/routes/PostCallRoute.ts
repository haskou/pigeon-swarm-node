import { Call } from '@app/contexts/calls/domain/Call';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostCallBody } from '../bodies/PostCallBody';
import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class PostCallRoute extends CallRouteSupport {
  @Post('/')
  public async startCall(
    @Body() body: PostCallBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const creatorIdentityId = await this.authenticate(request);
    const validatedScope = await this.validateScope(creatorIdentityId, body);

    if (
      validatedScope.scope.isCommunityChannel() &&
      body.communityId &&
      body.channelId
    ) {
      const activeCall =
        await this.callRepository().findActiveByCommunityChannel(
          new CommunityId(body.communityId),
          new CommunityChannelId(body.channelId),
        );

      if (activeCall) {
        activeCall.joinOrAdd(creatorIdentityId);
        await this.callRepository().save(activeCall);
        await this.eventPublisher.publish(activeCall.pullDomainEvents());

        return response
          .status(HttpRouteStatusEnum.OK)
          .send(new CallViewModel(activeCall).toResource());
      }
    }

    const participantIds = [
      ...validatedScope.participantIds,
      ...(body.invitedParticipantIds ?? []).map(
        (participantId) => new IdentityId(participantId),
      ),
    ];
    const call = Call.start(
      creatorIdentityId,
      validatedScope.networkId,
      validatedScope.scope,
      participantIds,
    );

    await this.callRepository().save(call);
    await this.eventPublisher.publish(call.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
