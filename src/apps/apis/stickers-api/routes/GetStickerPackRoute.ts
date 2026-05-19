import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class GetStickerPackRoute extends StickerRouteSupport {
  @Get('/:packId')
  public async getStickerPack(
    @Param('packId') packId: string,
    @Res() response: Response,
  ): Promise<Response> {
    const pack = await this.findPack(packId);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
