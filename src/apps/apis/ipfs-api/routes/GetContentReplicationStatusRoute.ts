import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ContentReplicationStatusSummaryFinder from '@app/contexts/content-replication/application/find-summary/ContentReplicationStatusSummaryFinder';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../../nodes-api/errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { ContentReplicationStatusViewModel } from '../view-model/ContentReplicationStatusViewModel';

@JsonController('/ipfs')
export class GetContentReplicationStatusRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly finder = this.get<ContentReplicationStatusSummaryFinder>(
    ContentReplicationStatusSummaryFinder,
  );

  private async assertCanReadReplicationStatus(
    request: Request,
  ): Promise<void> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const node = await this.loader.loadNode();

    if (node.hasOwner() && !node.isOwnedBy(authenticatedIdentityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }
  }

  @Get('/replication/status')
  public async request(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertCanReadReplicationStatus(request);
    const status = await this.finder.find();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ContentReplicationStatusViewModel(status).toResource());
  }
}
