import CommunityChannelDraftRepository from '@app/contexts/communities/domain/repositories/CommunityChannelDraftRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Timestamp } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  Get,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutCommunityChannelDraftBody } from '../bodies/PutCommunityChannelDraftBody';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class CommunityChannelDraftsRoute extends CommunityRouteSupport {
  private readonly draftRepository = this.get<CommunityChannelDraftRepository>(
    CommunityChannelDraftRepository,
  );

  @Get('/me/drafts')
  public async listDrafts(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const drafts = await this.draftRepository.findByIdentity(identityId);

    return response.status(HttpRouteStatusEnum.OK).send({
      drafts: drafts.map((draft) => ({
        channelId: draft.channelId,
        communityId: draft.communityId,
        encryptedPayload: draft.encryptedPayload,
        updatedAt: draft.updatedAt,
      })),
    });
  }

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

    community.assertCanViewTextChannel(actorIdentityId, domainChannelId);
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

  @Delete('/:communityId/channels/:channelId/draft')
  public async deleteDraft(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const domainCommunityId = new CommunityId(communityId);
    const domainChannelId = new CommunityChannelId(channelId);

    community.assertCanViewTextChannel(actorIdentityId, domainChannelId);
    await this.draftRepository.delete(
      actorIdentityId,
      domainCommunityId,
      domainChannelId,
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
    });
  }
}
