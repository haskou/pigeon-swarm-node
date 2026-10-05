import { StickerPackForgetMessage } from '@app/contexts/stickers/application/forget-pack/messages/StickerPackForgetMessage';
import StickerPackForgetter from '@app/contexts/stickers/application/forget-pack/StickerPackForgetter';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { StickerMutationBody } from '../bodies/StickerMutationBody';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class DeleteSavedStickerPackRoute extends StickerRouteSupport {
  private readonly forgetter =
    this.get<StickerPackForgetter>(StickerPackForgetter);

  @Delete('/:packId/saved')
  public async forgetPack(
    @Param('packId') packId: string,
    @Body() body: StickerMutationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const library = await this.forgetter.forget(
      new StickerPackForgetMessage(identityId.valueOf(), packId, body.mutation),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(await this.libraryResource(library));
  }
}
