import { NodeNetworkSynchronizationStatusPrimitives } from './NodeNetworkSynchronizationStatusPrimitives';

export class NodeNetworkSynchronizationStatus {
  public constructor(
    private readonly primitives: NodeNetworkSynchronizationStatusPrimitives,
  ) {}

  public toPrimitives(): NodeNetworkSynchronizationStatusPrimitives {
    return this.primitives;
  }
}
