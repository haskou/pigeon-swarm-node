import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityChannelsViewModel } from '../view-model/CommunityChannelsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelsRoute extends CommunityRouteSupport {
  private static readonly THREAD_SUMMARY_LIMIT_PER_CHANNEL = 2;

  private readonly calls = this.get<CallRepository>(CallRepository);

  private readonly messages = this.get<CommunityChannelMessageRepository>(
    CommunityChannelMessageRepository,
  );

  private async findConnectedIdentityIdsByChannelId(
    communityId: string,
  ): Promise<Map<string, string[]>> {
    const calls = await this.calls.findActiveByCommunity(
      new CommunityId(communityId),
    );
    const connectedIdentityIdsByChannelId = new Map<string, string[]>();

    for (const call of calls) {
      const primitives = call.toPrimitives();
      const channelId = primitives.scope.channelId;

      if (!channelId) {
        continue;
      }

      connectedIdentityIdsByChannelId.set(
        channelId,
        primitives.participants
          .filter((participant) => participant.status === 'joined')
          .map((participant) => participant.identityId),
      );
    }

    return connectedIdentityIdsByChannelId;
  }

  @Get('/:communityId/channels')
  public async getChannels(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.viewAsMember(actorIdentityId);
    const connectedIdentityIdsByChannelId =
      await this.findConnectedIdentityIdsByChannelId(communityId);
    const visibleTextChannelIds = community
      .visibleChannelsFor(actorIdentityId)
      .textChannels.map((channel) => new CommunityChannelId(channel.id));
    const threadSummariesByChannelId =
      await this.messages.findThreadSummariesByChannel(
        new CommunityId(communityId),
        visibleTextChannelIds,
        GetCommunityChannelsRoute.THREAD_SUMMARY_LIMIT_PER_CHANNEL,
      );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityChannelsViewModel(
          community,
          actorIdentityId,
          connectedIdentityIdsByChannelId,
          threadSummariesByChannelId,
        ).toResource(),
      );
  }
}
