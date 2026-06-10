import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFSReplicationStatusSummaryFinder from '@app/contexts/ipfs-replication/application/find-summary/IPFSReplicationStatusSummaryFinder';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../../nodes-api/errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { IPFSReplicationStatusViewModel } from '../view-model/IPFSReplicationStatusViewModel';

@JsonController('/ipfs')
export class GetIPFSReplicationStatusRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly finder = this.get<IPFSReplicationStatusSummaryFinder>(
    IPFSReplicationStatusSummaryFinder,
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
      .send(new IPFSReplicationStatusViewModel(status).toResource());
  }
}
