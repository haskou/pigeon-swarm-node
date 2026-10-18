import { StickerUserLibraryFindMessage } from '@app/contexts/stickers/application/find-library/messages/StickerUserLibraryFindMessage';
import StickerUserLibraryFinder from '@app/contexts/stickers/application/find-library/StickerUserLibraryFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { StickerLibraryPageRequest } from '../requests/StickerLibraryPageRequest';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers')
export class GetStickerUserLibraryRoute extends StickerRouteSupport {
  private readonly finder = this.get<StickerUserLibraryFinder>(
    StickerUserLibraryFinder,
  );

  @Get('/library')
  public async getLibrary(
    @QueryParam('savedPacksLimit') savedPacksLimit: string | undefined,
    @QueryParam('savedPacksCursor') savedPacksCursor: string | undefined,
    @QueryParam('favoriteStickersLimit')
    favoriteStickersLimit: string | undefined,
    @QueryParam('favoriteStickersCursor')
    favoriteStickersCursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const page = new StickerLibraryPageRequest({
      favoriteStickersCursor,
      favoriteStickersLimit,
      savedPacksCursor,
      savedPacksLimit,
    });
    const library = await this.finder.find(
      new StickerUserLibraryFindMessage(identityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library, page));
  }
}
