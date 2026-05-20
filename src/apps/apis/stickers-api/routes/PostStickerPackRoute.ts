import { StickerPackCreateMessage } from '@app/contexts/stickers/application/create-pack/messages/StickerPackCreateMessage';
import { StickerPackCreator } from '@app/contexts/stickers/application/create-pack/StickerPackCreator';
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
    const pack = await new StickerPackCreator(
      this.packRepository(),
      this.libraryRepository(),
    ).create(
      new StickerPackCreateMessage(ownerIdentityId.valueOf(), body.name),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new StickerPackViewModel(pack).toResource());
  }
}
