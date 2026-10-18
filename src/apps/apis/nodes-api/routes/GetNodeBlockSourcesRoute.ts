import { PageRequest } from '@app/apps/apis/shared/pagination/PageRequest';
import NodeBlockSourcesFinder from '@app/contexts/nodes/application/find-block-sources/NodeBlockSourcesFinder';
import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { NodeListPositions } from '../requests/NodeListPositions';
import { NodeBlockSourcesViewModel } from '../view-model/NodeBlockSourcesViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/block-sources')
export class GetNodeBlockSourcesRoute extends NodeOwnerRouteSupport {
  private readonly finder = this.get<NodeBlockSourcesFinder>(
    NodeBlockSourcesFinder,
  );

  @Get()
  public async getSources(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const pageRequest = new PageRequest(
      'block-sources',
      limit,
      cursor,
      NodeListPositions.identityId,
    );
    const after = pageRequest.getAfterPosition();
    const { sources } = new NodeBlockSourcesViewModel(
      await this.finder.find(),
    ).toResource();
    const page = PageSlice.of({
      after,
      items: sources,
      limit: pageRequest.getLimit(),
      order: 'asc',
      position: (source) => source.ownerIdentityId,
    });

    return response.status(HttpRouteStatusEnum.OK).send({
      nextCursor: pageRequest.nextCursor(page.nextPosition),
      sources: page.items,
    });
  }
}
