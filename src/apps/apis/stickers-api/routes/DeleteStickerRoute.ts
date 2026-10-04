import { StickerDeleteMessage } from '@app/contexts/stickers/application/delete-sticker/messages/StickerDeleteMessage';
import StickerDeleter from '@app/contexts/stickers/application/delete-sticker/StickerDeleter';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { DeleteStickerBody } from '../bodies/DeleteStickerBody';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteStickerRoute extends StickerRouteSupport {
  private readonly deleter = this.get<StickerDeleter>(StickerDeleter);

  @Delete('/:packId/stickers/:stickerId')
  public async deleteSticker(
    @Param('packId') packId: string,
    @Param('stickerId') stickerId: string,
    @Body() body: DeleteStickerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await this.deleter.delete(
      new StickerDeleteMessage(
        packId,
        stickerId,
        actor.valueOf(),
        body.updatedAt,
        body.mutation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
