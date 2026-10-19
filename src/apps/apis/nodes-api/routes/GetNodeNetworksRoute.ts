import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NetworksViewModel } from '../view-model/NetworksViewModel';

@JsonController('/node/networks')
export class GetNodeNetworksRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private async authenticatedIdentityId(
    request: Request,
  ): Promise<IdentityId | undefined> {
    try {
      return await this.signedRequestAuthenticator.authenticate(request);
    } catch {
      return undefined;
    }
  }

  @Get()
  public async getNetworks(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const node = await this.loader.loadNode();
    const identityId = await this.authenticatedIdentityId(request);

    return response.status(HttpRouteStatusEnum.OK).send(
      new NetworksViewModel(node, {
        exposeKeys: identityId !== undefined && node.isOwnedBy(identityId),
        exposePrivacy: identityId !== undefined,
      }).toResource(),
    );
  }
}
