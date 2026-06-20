import CommunityChannelDraftSaver from '@app/contexts/communities/application/manage-channel-draft/CommunityChannelDraftSaver';
import { CommunityChannelDraftSaveMessage } from '@app/contexts/communities/application/manage-channel-draft/messages/CommunityChannelDraftSaveMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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
  private readonly saver = this.get<CommunityChannelDraftSaver>(
    CommunityChannelDraftSaver,
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
    const message = new CommunityChannelDraftSaveMessage(
      actorIdentityId.valueOf(),
      communityId,
      channelId,
      body.encryptedPayload,
      body.updatedAt,
    );

    await this.saver.save(message);

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      encryptedPayload: body.encryptedPayload,
      updatedAt: message.updatedAt.valueOf(),
    });
  }
}
