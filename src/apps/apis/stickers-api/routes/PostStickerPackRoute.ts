import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerPackName } from '@app/contexts/stickers/domain/value-objects/StickerPackName';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostStickerPackBody } from '../bodies/PostStickerPackBody';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class PostStickerPackRoute extends StickerRouteSupport {
  @Post('/')
  public async createStickerPack(
    @Body() body: PostStickerPackBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = await this.authenticate(request);
    const pack = StickerPack.create(
      ownerIdentityId,
      new StickerPackName(body.name),
    );
    const library = await this.findLibrary(ownerIdentityId);

    library.savePack(pack.getId());
    await this.repository().save(pack);
    await this.libraryRepository().save(library);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
