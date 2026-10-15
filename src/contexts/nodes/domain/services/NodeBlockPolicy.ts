import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Node } from '../Node';
import { NodeBlocks } from '../NodeBlocks';
import NodeBlockListRepository from '../repositories/NodeBlockListRepository';
import NodeBlockEnforcer from './NodeBlockEnforcer';
import NodeLoaderService from './NodeLoaderService';

/**
 * The single answer to "does this node block it?". It keeps the stored list
 * in memory. An unclaimed node blocks nobody and the current owner is never
 * blocked, even if listed; this node's own peer id is ignored by the enforcer.
 */
export default class NodeBlockPolicy {
  private blocks?: Promise<NodeBlocks>;

  constructor(
    private readonly repository: NodeBlockListRepository,
    private readonly nodeLoader: NodeLoaderService,
    private readonly enforcer: NodeBlockEnforcer,
  ) {}

  private currentBlocks(): Promise<NodeBlocks> {
    if (!this.blocks) {
      const loading = this.repository.findLocal();

      this.blocks = loading;
      loading.catch(() => {
        if (this.blocks === loading) {
          this.blocks = undefined;
        }
      });
    }

    return this.blocks;
  }

  private async enforce(blocks: NodeBlocks, node: Node): Promise<void> {
    if (!node.hasOwner()) {
      await this.enforcer.enforce([], []);

      return;
    }

    await this.enforcer.enforce(
      blocks
        .getBlockedIdentityIds()
        .filter((identityId) => !node.isOwnedBy(identityId)),
      blocks.getBlockedNodePeerIds(),
    );
  }

  /** Loads the stored list and applies it; run once at startup. */
  public async load(): Promise<void> {
    this.blocks = undefined;

    await this.enforce(
      await this.currentBlocks(),
      await this.nodeLoader.loadNode(),
    );
  }

  /** Applies a list that was just stored for `node`. */
  public async replace(blocks: NodeBlocks, node: Node): Promise<void> {
    this.blocks = Promise.resolve(blocks);

    await this.enforce(blocks, node);
  }

  /** Re-applies the list after the owner changed, so a listed new owner is unblocked. */
  public async ownerChanged(node: Node): Promise<void> {
    await this.enforce(await this.currentBlocks(), node);
  }

  public async isIdentityBlocked(identityId: IdentityId): Promise<boolean> {
    const blocks = await this.currentBlocks();

    if (!blocks.blocksIdentity(identityId)) {
      return false;
    }

    const node = await this.nodeLoader.loadNode();

    return node.hasOwner() && !node.isOwnedBy(identityId);
  }
}
