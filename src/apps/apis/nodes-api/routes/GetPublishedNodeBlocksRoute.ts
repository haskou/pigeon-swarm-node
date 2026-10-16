import PublishedNodeBlockListFinder from '@app/contexts/nodes/application/find-published-block-list/PublishedNodeBlockListFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { NodeBlockListIsNotPublishedError } from '../errors/NodeBlockListIsNotPublishedError';

/**
 * Public: the owner's list, when the owner published it, as the exact bytes
 * the owner signed (canonical JSON without `identitySignature`) with the
 * signature in `X-Identity-Signature`, so a subscriber verifies the bytes
 * before parsing them.
 */
@JsonController('/node/blocks/published')
export class GetPublishedNodeBlocksRoute extends Route {
  private static readonly SIGNATURE_HEADER = 'X-Identity-Signature';

  private readonly finder = this.get<PublishedNodeBlockListFinder>(
    PublishedNodeBlockListFinder,
  );

  @Get('/')
  public async getPublished(@Res() response: Response): Promise<Response> {
    const signed = (await this.finder.find()).toSigned();

    if (!signed) {
      throw new NodeBlockListIsNotPublishedError();
    }

    return response
      .status(HttpRouteStatusEnum.OK)
      .type('application/json')
      .set(
        GetPublishedNodeBlocksRoute.SIGNATURE_HEADER,
        signed.getIdentitySignature().valueOf(),
      )
      .set(
        'Access-Control-Expose-Headers',
        GetPublishedNodeBlocksRoute.SIGNATURE_HEADER,
      )
      .send(signed.getContent());
  }
}
