import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Node } from '@app/contexts/nodes/domain/Node';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';

@JsonController('/node/networks')
export class GetNodeNetworksRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private canExposeNetworkKeys(node: Node, request: Request): boolean {
    const identityId = request.header('x-identity-id');

    if (!identityId) {
      return false;
    }

    try {
      return node.isOwnedBy(new IdentityId(identityId));
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

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NetworksViewModel(
          node,
          this.canExposeNetworkKeys(node, request),
        ).toResource(),
      );
  }
}
