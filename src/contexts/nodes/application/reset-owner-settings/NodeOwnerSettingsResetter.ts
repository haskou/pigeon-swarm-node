import NodeBlockListRepository from '../../domain/repositories/NodeBlockListRepository';
import NodeOwnerSettingsReset from '../../domain/repositories/NodeOwnerSettingsReset';
import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { ClearedNodeOwnerSetting } from '../../domain/value-objects/ClearedNodeOwnerSetting';

/**
 * Forgets the node owner and every setting only the owner could make, so the
 * next owner claim works as on an unclaimed node. Node id, networks, relay
 * configuration and all identity data stay. Runs on the host while the node is
 * stopped, so it records no replicated event.
 */
export default class NodeOwnerSettingsResetter {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly registrationCodes: NodeRegistrationCodeRepository,
    private readonly blockLists: NodeBlockListRepository,
  ) {}

  /** Every owner-settings store; the owner first, so a partial reset never leaves its settings without it. */
  private resets(): NodeOwnerSettingsReset[] {
    return [this.nodes, this.registrationCodes, this.blockLists];
  }

  public async reset(): Promise<ClearedNodeOwnerSetting[]> {
    const cleared: ClearedNodeOwnerSetting[] = [];

    for (const store of this.resets()) {
      cleared.push(...(await store.resetOwnerSettings()));
    }

    return cleared;
  }
}
