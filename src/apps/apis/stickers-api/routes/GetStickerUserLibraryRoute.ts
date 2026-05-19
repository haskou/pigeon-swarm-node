import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { StickerUserLibraryViewModel } from '../view-model/StickerUserLibraryViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers')
export class GetStickerUserLibraryRoute extends StickerRouteSupport {
  @Get('/me')
  public async getLibrary(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.findLibrary(identityId);
    const packs = await this.repository().findAll();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerUserLibraryViewModel(library, packs).toResource());
  }
}
