import { StickerAddMessage } from '@app/contexts/stickers/application/add-sticker/messages/StickerAddMessage';
import StickerAdder from '@app/contexts/stickers/application/add-sticker/StickerAdder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { StickerBody } from '../bodies/StickerBody';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PostStickerRoute extends StickerRouteSupport {
  private readonly adder = this.get<StickerAdder>(StickerAdder);

  @Post('/:packId/stickers')
  public async addSticker(
    @Param('packId') packId: string,
    @Body() body: StickerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await this.adder.add(
      new StickerAddMessage(packId, actor.valueOf(), body),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
