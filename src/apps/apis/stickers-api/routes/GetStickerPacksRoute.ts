import { StickerPacksFindMessage } from '@app/contexts/stickers/application/find-packs/messages/StickerPacksFindMessage';
import StickerPacksFinder from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, QueryParam, Res } from 'routing-controllers';

import { StickerPacksResource } from '../resources/StickerPacksResource';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class GetStickerPacksRoute extends StickerRouteSupport {
  private readonly finder = this.get<StickerPacksFinder>(StickerPacksFinder);

  @Get('/')
  public async getStickerPacks(
    @QueryParam('ownerIdentityId') ownerIdentityId: string | undefined,
    @Res() response: Response,
  ): Promise<Response> {
    const packs = await this.finder.find(
      new StickerPacksFindMessage(ownerIdentityId),
    );
    const resource: StickerPacksResource = {
      results: packs.map((pack) => new StickerPackViewModel(pack).toResource()),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
