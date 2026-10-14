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
    @QueryParam('after') after: string | undefined,
    @QueryParam('limit') limit: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const page = await this.finder.find(
      new GetCommunityOperationsRequest(
        communityId,
        actorIdentityId.valueOf(),
        after,
        limit,
      ).getMessage(),
    );
    const resource: CommunityOperationsResource = {
      communityId: page.getCommunityId().valueOf(),
      networkId: page.getNetworkId().valueOf(),
      operations: page
        .getOperations()
        .map((operation) => operation.toPrimitives()),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
