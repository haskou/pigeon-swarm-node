import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostNodeNetworkBody } from '../bodies/PostNodeNetworkBody';
import { NetworksViewModel } from '../view-model/NetworksViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/networks')
export class PostNodeNetworkRoute extends NodeOwnerRouteSupport {
  private readonly adder: NodeNetworkAdder =
    this.get<NodeNetworkAdder>(NodeNetworkAdder);

  @Post()
  public async addNetwork(
    @Body() body: PostNodeNetworkBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const { node, owner } = await this.setUpNodeAsOwnerWhenClaimed(
      request,
      async (identityId) => ({
        node: await this.adder.addNetwork(
          new NodeNetworkAdderMessage(
            body.id,
            body.name,
            body.key,
            identityId?.valueOf(),
          ),
        ),
        owner: identityId,
      }),
    );
    const signedByOwner = owner !== undefined && node.isOwnedBy(owner);

    return response.status(HttpRouteStatusEnum.OK).send(
      new NetworksViewModel(node, {
        exposeKeys: signedByOwner,
        exposePrivacy: signedByOwner,
      }).toResource(),
    );
  }
}
