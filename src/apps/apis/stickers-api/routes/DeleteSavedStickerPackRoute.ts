import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteSavedStickerPackRoute extends StickerRouteSupport {
  @Delete('/:packId/saved')
  public async forgetPack(
    @Param('packId') packId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.findLibrary(identityId);

    library.forgetPack(new StickerPackId(packId));
    await this.libraryRepository().save(library);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
