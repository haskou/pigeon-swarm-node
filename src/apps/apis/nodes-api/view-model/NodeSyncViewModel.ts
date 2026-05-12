import { NodeStartupSyncResult } from '@app/apps/synchronizers/NodeStartupSynchronizer';

import { NodeSyncResource } from '../resources/NodeSyncResource';

export class NodeSyncViewModel {
  constructor(private readonly result: NodeStartupSyncResult) {}

  public toResource(): NodeSyncResource {
    return this.result;
  }
}
