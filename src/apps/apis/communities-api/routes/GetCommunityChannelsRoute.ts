import { MongoCallRepository } from '@app/contexts/calls/infrastructure/mongo/MongoCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityChannelsViewModel } from '../view-model/CommunityChannelsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelsRoute extends CommunityRouteSupport {
  private static readonly THREAD_SUMMARY_LIMIT_PER_CHANNEL = 2;

  private callRepository(): MongoCallRepository {
    return new MongoCallRepository(this.get<MongoDB>(MongoDB));
  }

  private channelMessageRepository(): MongoCommunityChannelMessageRepository {
    return new MongoCommunityChannelMessageRepository(
      this.get<MongoDB>(MongoDB),
    );
  }

  private async findConnectedIdentityIdsByChannelId(
    communityId: string,
  ): Promise<Map<string, string[]>> {
    const calls = await this.callRepository().findActiveByCommunity(
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

    community.assertIsMember(actorIdentityId);
    const connectedIdentityIdsByChannelId =
      await this.findConnectedIdentityIdsByChannelId(communityId);
    const visibleTextChannelIds = community
      .visibleChannelsFor(actorIdentityId)
      .textChannels.map((channel) => new CommunityChannelId(channel.id));
    const threadSummariesByChannelId =
      await this.channelMessageRepository().findThreadSummariesByChannel(
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
