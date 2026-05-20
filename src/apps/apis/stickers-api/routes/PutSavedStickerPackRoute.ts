import { StickerPackSaveMessage } from '@app/contexts/stickers/application/save-pack/messages/StickerPackSaveMessage';
import { StickerPackSaver } from '@app/contexts/stickers/application/save-pack/StickerPackSaver';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Put, Req, Res } from 'routing-controllers';

import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PutSavedStickerPackRoute extends StickerRouteSupport {
  @Put('/:packId/saved')
  public async savePack(
    @Param('packId') packId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await new StickerPackSaver(
      this.packRepository(),
      this.libraryRepository(),
    ).save(new StickerPackSaveMessage(identityId.valueOf(), packId));

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
