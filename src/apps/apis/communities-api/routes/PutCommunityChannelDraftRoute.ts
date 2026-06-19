import CommunityChannelDraftRepository from '@app/contexts/communities/domain/repositories/CommunityChannelDraftRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Timestamp } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutCommunityChannelDraftBody } from '../bodies/PutCommunityChannelDraftBody';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PutCommunityChannelDraftRoute extends CommunityRouteSupport {
  private readonly draftRepository = this.get<CommunityChannelDraftRepository>(
    CommunityChannelDraftRepository,
  );

  @Put('/:communityId/channels/:channelId/draft')
  public async saveDraft(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PutCommunityChannelDraftBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const domainCommunityId = new CommunityId(communityId);
    const domainChannelId = new CommunityChannelId(channelId);
    const updatedAt = body.updatedAt
      ? new Timestamp(body.updatedAt)
      : Timestamp.now();

    community.viewTextChannel(actorIdentityId, domainChannelId);
    await this.draftRepository.save(
      actorIdentityId,
      domainCommunityId,
      domainChannelId,
      body.encryptedPayload,
      updatedAt,
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      encryptedPayload: body.encryptedPayload,
      updatedAt: updatedAt.valueOf(),
    });
  }
}
