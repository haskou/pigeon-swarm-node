import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { createNodeStartupSynchronizer } from '@app/apps/synchronizers/createNodeStartupSynchronizer';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { JsonController, Post, Req, Res } from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeSyncViewModel } from '../view-model/NodeSyncViewModel';

@JsonController('/node/sync')
export class PostNodeSyncRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private async assertCanTriggerSync(request: Request): Promise<void> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const node = await this.loader.loadNode();

    if (node.hasOwner() && !node.isOwnedBy(authenticatedIdentityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }
  }

  @Post('/')
  public async sync(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertCanTriggerSync(request);
    const result = await createNodeStartupSynchronizer().synchronize();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeSyncViewModel(result).toResource());
  }
}
