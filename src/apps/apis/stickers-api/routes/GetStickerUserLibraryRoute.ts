import { StickerUserLibraryFindMessage } from '@app/contexts/stickers/application/find-library/messages/StickerUserLibraryFindMessage';
import { StickerUserLibraryFinder } from '@app/contexts/stickers/application/find-library/StickerUserLibraryFinder';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers')
export class GetStickerUserLibraryRoute extends StickerRouteSupport {
  @Get('/me')
  public async getLibrary(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await new StickerUserLibraryFinder(
      this.libraryRepository(),
    ).find(new StickerUserLibraryFindMessage(identityId.valueOf()));

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
