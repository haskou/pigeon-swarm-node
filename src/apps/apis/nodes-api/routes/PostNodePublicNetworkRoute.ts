import { NodePublicNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodePublicNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Post, Req, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/networks/public')
export class PostNodePublicNetworkRoute extends NodeOwnerRouteSupport {
  private readonly adder: NodeNetworkAdder =
    this.get<NodeNetworkAdder>(NodeNetworkAdder);

  @Post('/')
  public async addPublicNetwork(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const node = await this.setUpNodeAsOwnerWhenClaimed(request, (identityId) =>
      this.adder.addPublicNetwork(
        new NodePublicNetworkAdderMessage(identityId?.valueOf()),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
