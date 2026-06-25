import { NodePublicNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodePublicNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Post, Req, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';
import { NodeNetworkRouteSupport } from './NodeNetworkRouteSupport';

@JsonController('/node/networks/public')
export class PostNodePublicNetworkRoute extends NodeNetworkRouteSupport {
  private readonly adder: NodeNetworkAdder =
    this.get<NodeNetworkAdder>(NodeNetworkAdder);

  @Post('/')
  public async addPublicNetwork(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNetworksWhenClaimed(request);
    await this.adder.addPublicNetwork(new NodePublicNetworkAdderMessage());

    const node = await this.nodeLoader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
