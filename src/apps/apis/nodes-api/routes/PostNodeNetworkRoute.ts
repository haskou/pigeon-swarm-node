import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostNodeNetworkBody } from '../bodies/PostNodeNetworkBody';
import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NetworksViewModel } from '../view-model/NetworksViewModel';

@JsonController('/node/networks')
export class PostNodeNetworkRoute extends Route {
  private readonly adder: NodeNetworkAdder =
    this.get<NodeNetworkAdder>(NodeNetworkAdder);

  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private async assertCanManageNetworks(request: Request): Promise<void> {
    const node = await this.loader.loadNode();

    if (!node.hasOwner()) {
      return;
    }

    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    if (!node.isOwnedBy(authenticatedIdentityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }
  }

  @Post('/')
  public async addNetwork(
    @Body() body: PostNodeNetworkBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertCanManageNetworks(request);
    await this.adder.addNetwork(
      new NodeNetworkAdderMessage(body.id, body.name, body.key),
    );

    const node = await this.loader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
