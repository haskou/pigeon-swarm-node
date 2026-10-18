import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityOperationsFinder from '@app/contexts/communities/application/find-operations/CommunityOperationsFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { GetCommunityOperationsRequest } from '../requests/GetCommunityOperationsRequest';
import { CommunityOperationsResource } from '../resources/CommunityOperationsResource';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityOperationsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityOperationsFinder>(
    CommunityOperationsFinder,
  );

  /** The stored signed operations, verbatim, so members replay the roles themselves. */
  @Get('/:communityId/operations')
  public async getCommunityOperations(
    @Param('communityId') communityId: string,
    @QueryParam('cursor') cursor: string | undefined,
    @QueryParam('limit') limit: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const pageRequest = new GetCommunityOperationsRequest(
      communityId,
      actorIdentityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();
    const resource: CommunityOperationsResource = {
      communityId: page.getCommunityId().valueOf(),
      networkId: page.getNetworkId().valueOf(),
      nextCursor:
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
      operations: page
        .getOperations()
        .map((operation) => operation.toPrimitives()),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
