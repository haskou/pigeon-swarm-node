import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import NodeBlockListRepository from '../../domain/repositories/NodeBlockListRepository';
import NodeOwnerSettingsReset from '../../domain/repositories/NodeOwnerSettingsReset';
import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { ClearedNodeOwnerSetting } from '../../domain/value-objects/ClearedNodeOwnerSetting';

/**
 * Hands a node whose owner key is lost to the new owner the node operator
 * names, and clears every setting only the old owner could make. The node is
 * never left without an owner, so no other identity can claim it. Node id,
 * networks, relay configuration and all identity data stay. Runs on the host
 * while the node is stopped, so it records no replicated event.
 */
export default class NodeOwnerSettingsResetter {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly registrationCodes: NodeRegistrationCodeRepository,
    private readonly blockLists: NodeBlockListRepository,
  ) {}

  /** Every owner-settings store besides the node's own owner and registration mode. */
  private resets(): NodeOwnerSettingsReset[] {
    return [this.registrationCodes, this.blockLists];
  }

  /**
   * Refuses a missing node or an unchanged owner before writing anything. The
   * new owner is saved last, in the same write that drops the old owner and
   * registration mode: if clearing a store fails, the old owner still holds
   * the node and the operator can run the reset again.
   */
  public async reset(newOwner: IdentityId): Promise<ClearedNodeOwnerSetting[]> {
    const node = await this.nodes.loadStoppedLocalNode();
    const cleared = node.replaceLostOwner(newOwner);

    for (const store of this.resets()) {
      cleared.push(...(await store.resetOwnerSettings()));
    }

    await this.nodes.saveStoppedLocalNode(node);

    return cleared;
  }
}
