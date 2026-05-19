import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Response } from 'express';
import { Get, JsonController, QueryParam, Res } from 'routing-controllers';

import { StickerPacksResource } from '../resources/StickerPacksResource';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class GetStickerPacksRoute extends StickerRouteSupport {
  @Get('/')
  public async getStickerPacks(
    @QueryParam('ownerIdentityId') ownerIdentityId: string | undefined,
    @Res() response: Response,
  ): Promise<Response> {
    const packs = ownerIdentityId
      ? await this.repository().findByOwner(new IdentityId(ownerIdentityId))
      : await this.repository().findAll();
    const resource: StickerPacksResource = {
      results: packs.map((pack) => new StickerPackViewModel(pack).toResource()),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
