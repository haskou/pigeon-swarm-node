import { StickerUseRecordMessage } from '@app/contexts/stickers/application/record-sticker-use/messages/StickerUseRecordMessage';
import StickerUseRecorder from '@app/contexts/stickers/application/record-sticker-use/StickerUseRecorder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PostUsedStickerRoute extends StickerRouteSupport {
  private readonly recorder = this.get<StickerUseRecorder>(StickerUseRecorder);

  @Post('/:packId/stickers/:stickerId/used')
  public async recordStickerUse(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.recorder.record(
      new StickerUseRecordMessage(identityId.valueOf(), packId, stickerId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
