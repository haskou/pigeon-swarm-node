import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PublicRelayRuntime } from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { NodeViewModel } from '../view-model/NodeViewModel';

@JsonController('/node')
export class GetNodeRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);
  private readonly relayRuntime = new PublicRelayRuntime(
    this.get<IPFSNetworkRegistry>(IPFSNetworkRegistry),
  );

  @Get('/')
  public async getNode(@Res() response: Response): Promise<Response> {
    const node = await this.loader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NodeViewModel(node, this.relayRuntime.debugState()).toResource(),
      );
  }
}
