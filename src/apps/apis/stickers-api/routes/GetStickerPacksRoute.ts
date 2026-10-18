import StickerPacksFinder from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, QueryParam, Res } from 'routing-controllers';

import { GetStickerPacksRequest } from '../requests/GetStickerPacksRequest';
import { StickerPacksResource } from '../resources/StickerPacksResource';
import { StickerPackViewModel } from '../view-model/StickerPackViewModel';
import { StickerRouteSupport } from './StickerRouteSupport';

@JsonController('/stickers/packs')
export class GetStickerPacksRoute extends StickerRouteSupport {
  private readonly finder = this.get<StickerPacksFinder>(StickerPacksFinder);

  @Get()
  public async getStickerPacks(
    @QueryParam('ownerIdentityId') ownerIdentityId: string | undefined,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Res() response: Response,
  ): Promise<Response> {
    const pageRequest = new GetStickerPacksRequest(
      ownerIdentityId,
      limit,
      cursor,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const resource: StickerPacksResource = {
      nextCursor: pageRequest.nextCursor(page.nextPosition),
      results: page.items.map((pack) =>
        new StickerPackViewModel(pack).toResource(),
      ),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
