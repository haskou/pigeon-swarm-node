import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
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
import { StickerBodyMapper } from './StickerBodyMapper';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PatchStickerRoute extends StickerRouteSupport {
  @Patch('/:packId/stickers/:stickerId')
  public async updateSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Body() body: StickerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await this.findPack(packId);
    const sticker = new StickerBodyMapper(body);

    pack.updateSticker(actor, new StickerId(stickerId), sticker.details());
    await this.repository().save(pack);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
