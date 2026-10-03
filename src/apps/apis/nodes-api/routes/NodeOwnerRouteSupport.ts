import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Node } from '@app/contexts/nodes/domain/Node';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { assert } from '@haskou/value-objects';
import { Request } from 'express';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';

export abstract class NodeOwnerRouteSupport extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected readonly nodeLoader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private async assertAuthenticatedOwner(
    request: Request,
    node: Node,
  ): Promise<IdentityId> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    assert(
      node.isOwnedBy(authenticatedIdentityId),
      new AuthenticatedIdentityIsNotNodeOwnerError(),
    );

    return authenticatedIdentityId;
  }

  protected async authenticateNodeOwner(request: Request): Promise<IdentityId> {
    return this.assertAuthenticatedOwner(
      request,
      await this.nodeLoader.loadNode(),
    );
  }

  protected async assertOwnerCanManageNode(request: Request): Promise<void> {
    await this.authenticateNodeOwner(request);
  }

  protected async assertOwnerCanManageNodeWhenClaimed(
    request: Request,
  ): Promise<void> {
    const node = await this.nodeLoader.loadNode();

    if (!node.hasOwner()) {
      return;
    }

    await this.assertAuthenticatedOwner(request, node);
  }
}
