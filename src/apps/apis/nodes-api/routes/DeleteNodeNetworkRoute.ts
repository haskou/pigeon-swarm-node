import { NodeNetworkRemoverMessage } from '@app/contexts/nodes/application/remove-network/messages/NodeNetworkRemoverMessage';
import NodeNetworkRemover from '@app/contexts/nodes/application/remove-network/NodeNetworkRemover';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';
import { NodeNetworkRouteSupport } from './NodeNetworkRouteSupport';

@JsonController('/node/networks')
export class DeleteNodeNetworkRoute extends NodeNetworkRouteSupport {
  private readonly remover = this.get<NodeNetworkRemover>(NodeNetworkRemover);

  @Delete('/:networkId')
  public async deleteNetwork(
    @Param('networkId') networkId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNetworks(request);
    await this.remover.remove(new NodeNetworkRemoverMessage(networkId));

    const node = await this.nodeLoader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
