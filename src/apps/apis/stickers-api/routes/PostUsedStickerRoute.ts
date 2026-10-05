import { StickerUseRecordMessage } from '@app/contexts/stickers/application/record-sticker-use/messages/StickerUseRecordMessage';
import StickerUseRecorder from '@app/contexts/stickers/application/record-sticker-use/StickerUseRecorder';
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

import { PostUsedStickerBody } from '../bodies/PostUsedStickerBody';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PostUsedStickerRoute extends StickerRouteSupport {
  private readonly recorder = this.get<StickerUseRecorder>(StickerUseRecorder);

  @Post('/:packId/stickers/:stickerId/used')
  public async recordStickerUse(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Body() body: PostUsedStickerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.recorder.record(
      new StickerUseRecordMessage(
        identityId.valueOf(),
        packId,
        stickerId,
        body.usedAt,
        body.mutation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
