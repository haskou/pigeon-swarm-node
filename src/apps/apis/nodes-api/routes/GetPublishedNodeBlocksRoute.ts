import PublishedNodeBlockListFinder from '@app/contexts/nodes/application/find-published-block-list/PublishedNodeBlockListFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { NodeBlockListIsNotPublishedError } from '../errors/NodeBlockListIsNotPublishedError';

/** Public: the owner's signed list, exactly as stored, when the owner published it. */
@JsonController('/node/blocks/published')
export class GetPublishedNodeBlocksRoute extends Route {
  private readonly finder = this.get<PublishedNodeBlockListFinder>(
    PublishedNodeBlockListFinder,
  );

  @Get('/')
  public async getPublished(@Res() response: Response): Promise<Response> {
    const blockList = (await this.finder.find()).toPrimitives();

    if (!blockList) {
      throw new NodeBlockListIsNotPublishedError();
    }

    return response.status(HttpRouteStatusEnum.OK).send(blockList);
  }
}
