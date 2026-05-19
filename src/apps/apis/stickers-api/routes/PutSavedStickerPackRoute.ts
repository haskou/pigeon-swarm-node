import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
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
    await this.findPack(packId);
    const library = await this.findLibrary(identityId);

    library.savePack(new StickerPackId(packId));
    await this.libraryRepository().save(library);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
