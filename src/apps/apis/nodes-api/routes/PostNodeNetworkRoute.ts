import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostNodeNetworkBody } from '../bodies/PostNodeNetworkBody';
import { NetworksViewModel } from '../view-model/NetworksViewModel';
import { NodeNetworkRouteSupport } from './NodeNetworkRouteSupport';

@JsonController('/node/networks')
export class PostNodeNetworkRoute extends NodeNetworkRouteSupport {
  private readonly adder: NodeNetworkAdder =
    this.get<NodeNetworkAdder>(NodeNetworkAdder);

  @Post('/')
  public async addNetwork(
    @Body() body: PostNodeNetworkBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNetworksWhenClaimed(request);
    await this.adder.addNetwork(
      new NodeNetworkAdderMessage(body.id, body.name, body.key),
    );

    const node = await this.nodeLoader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
