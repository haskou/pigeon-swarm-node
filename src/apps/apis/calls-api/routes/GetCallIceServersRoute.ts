import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CallIceServerConfig } from '../CallIceServerConfig';
import CallRelayRecordRegistry from '../CallRelayRecordRegistry';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallIceServersRoute extends CallRouteSupport {
  private readonly callRelayRecordRegistry = this.get<CallRelayRecordRegistry>(
    CallRelayRecordRegistry,
  );

  private readonly networkRegistry =
    this.get<IPFSNetworkRegistry>(IPFSNetworkRegistry);

  @Get('/ice-servers')
  public async getIceServers(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        CallIceServerConfig.fromRelaySettings(
          this.networkRegistry.getRelaySettings(),
        ).toResource(
          identityId,
          this.callRelayRecordRegistry.urlsForPeers(
            this.networkRegistry.getConnectedRelayPeerIds(),
          ),
        ),
      );
  }
}
