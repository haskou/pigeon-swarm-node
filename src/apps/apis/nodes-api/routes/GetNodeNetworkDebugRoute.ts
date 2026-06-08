import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PublicRelayRuntime } from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

import { NodeNetworkDebugViewModel } from '../view-model/NodeNetworkDebugViewModel';

@JsonController('/node/network')
export class GetNodeNetworkDebugRoute extends Route {
  private readonly relayRuntime = new PublicRelayRuntime(
    this.get<IPFSNetworkRegistry>(IPFSNetworkRegistry),
  );

  private exposeSensitiveDebug(): boolean {
    return process.env.DEBUG_NETWORK === 'true';
  }

  @Get('/debug')
  public getDebug(@Res() response: Response): Response {
    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new NodeNetworkDebugViewModel(
          this.relayRuntime.debugState(),
          this.exposeSensitiveDebug(),
        ).toResource(),
      );
  }
}
