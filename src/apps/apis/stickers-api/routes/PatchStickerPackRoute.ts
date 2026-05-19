import { StickerPackDescription } from '@app/contexts/stickers/domain/value-objects/StickerPackDescription';
import { StickerPackName } from '@app/contexts/stickers/domain/value-objects/StickerPackName';
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
    const pack = await this.findPack(packId);

    pack.updateProfile(
      actor,
      new StickerPackName(body.name),
      new StickerPackDescription(body.description),
    );
    await this.repository().save(pack);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
