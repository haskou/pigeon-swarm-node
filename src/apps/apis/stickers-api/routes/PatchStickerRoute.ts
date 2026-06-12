import { StickerUpdateMessage } from '@app/contexts/stickers/application/update-sticker/messages/StickerUpdateMessage';
import { StickerUpdater } from '@app/contexts/stickers/application/update-sticker/StickerUpdater';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { StickerBody } from '../bodies/StickerBody';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PatchStickerRoute extends StickerRouteSupport {
  private readonly updater = this.get<StickerUpdater>(StickerUpdater);

  @Patch('/:packId/stickers/:stickerId')
  public async updateSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Body() body: StickerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await this.updater.update(
      new StickerUpdateMessage(packId, stickerId, actor.valueOf(), body),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
