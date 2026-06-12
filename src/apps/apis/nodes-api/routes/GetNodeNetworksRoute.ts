import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Node } from '@app/contexts/nodes/domain/Node';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';

@JsonController('/node/networks')
export class GetNodeNetworksRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private async canExposeNetworkKeys(
    node: Node,
    request: Request,
  ): Promise<boolean> {
    try {
      const authenticatedIdentityId =
        await this.signedRequestAuthenticator.authenticate(request);

      return node.isOwnedBy(authenticatedIdentityId);
    } catch {
      return false;
    }
  }

  @Get('/')
  public async getNetworks(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const node = await this.loader.loadNode();
    const canExposeNetworkKeys = await this.canExposeNetworkKeys(node, request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node, canExposeNetworkKeys).toResource());
  }
}
