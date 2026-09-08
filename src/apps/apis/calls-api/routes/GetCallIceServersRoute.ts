import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { CallIceServerConfig } from '../CallIceServerConfig';
import { CallIceServerDiagnostics } from '../CallIceServerDiagnostics';
import CallRelayRecordRegistry from '../CallRelayRecordRegistry';
import FederatedCallRelayCredentials from '../FederatedCallRelayCredentials';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallIceServersRoute extends CallRouteSupport {
  private readonly callRelayRecordRegistry = this.get<CallRelayRecordRegistry>(
    CallRelayRecordRegistry,
  );

  private readonly networkRegistry =
    this.get<IPFSNetworkRegistry>(IPFSNetworkRegistry);

  private readonly federatedCredentials =
    this.get<FederatedCallRelayCredentials>(FederatedCallRelayCredentials);

  @Get('/ice-servers')
  public async getIceServers(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);

    const resource = CallIceServerConfig.fromRelaySettings(
      this.networkRegistry.getRelaySettings(),
    ).toResource(
      identityId,
      this.callRelayRecordRegistry.urlsForPeers(
        this.networkRegistry.getConnectedRelayPeerIds(),
      ),
    );

    if (!resource.iceServers.some((server) => server.credential)) {
      const federated = await this.federatedCredentials.get();

      if (federated.length > 0) {
        resource.iceServers.push(...federated);
        resource.diagnostics = new CallIceServerDiagnostics(
          federated.flatMap((server) => server.urls),
          false,
          resource.diagnostics.turnSharedSecretConfigured,
        ).toResource();
      }
    }

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
