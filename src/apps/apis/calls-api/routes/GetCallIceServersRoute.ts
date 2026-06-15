import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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

  @Get('/ice-servers')
  public async getIceServers(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        CallIceServerConfig.fromEnvironment().toResource(
          identityId,
          this.callRelayRecordRegistry.urlsExceptPeer(undefined),
        ),
      );
  }
}
