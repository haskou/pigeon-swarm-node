import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';

/** Loads this node's stored block list and applies it before the runtimes start. */
export default class NodeBlockPolicyInitializer {
  constructor(private readonly policy: NodeBlockPolicy) {}

  public async ensure(): Promise<void> {
    await this.policy.load();
  }
}
