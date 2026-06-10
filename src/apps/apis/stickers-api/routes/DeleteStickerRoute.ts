import { StickerDeleteMessage } from '@app/contexts/stickers/application/delete-sticker/messages/StickerDeleteMessage';
import { StickerDeleter } from '@app/contexts/stickers/application/delete-sticker/StickerDeleter';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteStickerRoute extends StickerRouteSupport {
  private readonly deleter = this.get<StickerDeleter>(StickerDeleter);

  @Delete('/:packId/stickers/:stickerId')
  public async deleteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await this.deleter.delete(
      new StickerDeleteMessage(packId, stickerId, actor.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
