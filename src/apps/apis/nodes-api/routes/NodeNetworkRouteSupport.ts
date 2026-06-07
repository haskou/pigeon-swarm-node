import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Node } from '@app/contexts/nodes/domain/Node';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';

export abstract class NodeNetworkRouteSupport extends Route {
  protected readonly nodeLoader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private async assertAuthenticatedOwner(
    request: Request,
    node: Node,
  ): Promise<void> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    if (!node.isOwnedBy(authenticatedIdentityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }
  }

  protected async assertOwnerCanManageNetworks(
    request: Request,
  ): Promise<void> {
    const node = await this.nodeLoader.loadNode();

    await this.assertAuthenticatedOwner(request, node);
  }

  protected async assertOwnerCanManageNetworksWhenClaimed(
    request: Request,
  ): Promise<void> {
    const node = await this.nodeLoader.loadNode();

    if (!node.hasOwner()) {
      return;
    }

    await this.assertAuthenticatedOwner(request, node);
  }
}
