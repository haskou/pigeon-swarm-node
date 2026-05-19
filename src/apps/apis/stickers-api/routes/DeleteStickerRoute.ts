import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteStickerRoute extends StickerRouteSupport {
  @Delete('/:packId/stickers/:stickerId')
  public async deleteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await this.findPack(packId);

    pack.removeSticker(actor, new StickerId(stickerId));
    await this.repository().save(pack);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
