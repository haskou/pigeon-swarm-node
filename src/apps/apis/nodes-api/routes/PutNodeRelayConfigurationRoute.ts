import { NodeRelayConfigurationUpdaterMessage } from '@app/contexts/nodes/application/update-relay-configuration/messages/NodeRelayConfigurationUpdaterMessage';
import NodeRelayConfigurationUpdater from '@app/contexts/nodes/application/update-relay-configuration/NodeRelayConfigurationUpdater';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNodeRelayConfigurationBody } from '../bodies/PutNodeRelayConfigurationBody';
import { NodeRelayConfigurationViewModel } from '../view-model/NodeRelayConfigurationViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/relay-configuration')
export class PutNodeRelayConfigurationRoute extends NodeOwnerRouteSupport {
  private readonly updater: NodeRelayConfigurationUpdater =
    this.get<NodeRelayConfigurationUpdater>(NodeRelayConfigurationUpdater);

  @Put('/')
  public async putRelayConfiguration(
    @Body() body: PutNodeRelayConfigurationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);
    await this.updater.update(new NodeRelayConfigurationUpdaterMessage(body));

    const node = await this.nodeLoader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeRelayConfigurationViewModel(node).toResource());
  }
}
