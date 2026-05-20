import { StickerPackUpdateMessage } from '@app/contexts/stickers/application/update-pack/messages/StickerPackUpdateMessage';
import { StickerPackUpdater } from '@app/contexts/stickers/application/update-pack/StickerPackUpdater';
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

import { PatchStickerPackBody } from '../bodies/PatchStickerPackBody';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PatchStickerPackRoute extends StickerRouteSupport {
  @Patch('/:packId')
  public async updateStickerPack(
    @Param('packId') packId: string,
    @Body() body: PatchStickerPackBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const pack = await new StickerPackUpdater(this.packRepository()).update(
      new StickerPackUpdateMessage(packId, actor.valueOf(), body.name),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
