import { Request } from 'express';

import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

export abstract class NodeNetworkRouteSupport extends NodeOwnerRouteSupport {
  protected async assertOwnerCanManageNetworks(
    request: Request,
  ): Promise<void> {
    await this.assertOwnerCanManageNode(request);
  }

  protected async assertOwnerCanManageNetworksWhenClaimed(
    request: Request,
  ): Promise<void> {
    await this.assertOwnerCanManageNodeWhenClaimed(request);
  }
}
