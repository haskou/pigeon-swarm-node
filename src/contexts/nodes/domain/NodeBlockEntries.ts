import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodeBlockEntriesPrimitives } from './NodeBlockEntriesPrimitives';
import { NodeBlocks } from './NodeBlocks';
import { NodePeerId } from './value-objects/NodePeerId';

/**
 * A set of blockable identities and node peer ids: what a source still has
 * waiting for review, what the owner approved, or the owner's local
 * exceptions. Lookups are by key, so sets of any size combine in linear time.
 */
export class NodeBlockEntries {
  private readonly identityIds: Map<string, IdentityId>;
  private readonly nodePeerIds: Map<string, NodePeerId>;

  public static none(): NodeBlockEntries {
    return new NodeBlockEntries([], []);
  }

  public static of(blocks: NodeBlocks): NodeBlockEntries {
    return new NodeBlockEntries(
      blocks.getBlockedIdentityIds(),
      blocks.getBlockedNodePeerIds(),
    );
  }

  public static fromPrimitives(
    primitives: NodeBlockEntriesPrimitives,
  ): NodeBlockEntries {
    return new NodeBlockEntries(
      primitives.identityIds.map((identityId) => new IdentityId(identityId)),
      primitives.nodePeerIds.map((nodePeerId) => new NodePeerId(nodePeerId)),
    );
  }

  constructor(identityIds: IdentityId[], nodePeerIds: NodePeerId[]) {
    this.identityIds = new Map(
      identityIds.map((identityId) => [identityId.valueOf(), identityId]),
    );
    this.nodePeerIds = new Map(
      nodePeerIds.map((nodePeerId) => [nodePeerId.valueOf(), nodePeerId]),
    );
  }

  public blocksIdentity(identityId: IdentityId): boolean {
    return this.identityIds.has(identityId.valueOf());
  }

  public blocksNodePeer(nodePeerId: NodePeerId): boolean {
    return this.nodePeerIds.has(nodePeerId.valueOf());
  }

  /** Whether every entry of `entries` is also here. */
  public includes(entries: NodeBlockEntries): boolean {
    return (
      entries.getIdentityIds().every((id) => this.blocksIdentity(id)) &&
      entries.getNodePeerIds().every((id) => this.blocksNodePeer(id))
    );
  }

  public union(entries: NodeBlockEntries): NodeBlockEntries {
    return new NodeBlockEntries(
      [...this.getIdentityIds(), ...entries.getIdentityIds()],
      [...this.getNodePeerIds(), ...entries.getNodePeerIds()],
    );
  }

  public intersection(entries: NodeBlockEntries): NodeBlockEntries {
    return new NodeBlockEntries(
      this.getIdentityIds().filter((id) => entries.blocksIdentity(id)),
      this.getNodePeerIds().filter((id) => entries.blocksNodePeer(id)),
    );
  }

  public without(entries: NodeBlockEntries): NodeBlockEntries {
    return new NodeBlockEntries(
      this.getIdentityIds().filter((id) => !entries.blocksIdentity(id)),
      this.getNodePeerIds().filter((id) => !entries.blocksNodePeer(id)),
    );
  }

  /**
   * Only the identity ids that are the canonical encoding of a usable key: no
   * request can be made under any other id, so blocking one enforces nothing.
   */
  public canonical(): NodeBlockEntries {
    return new NodeBlockEntries(
      this.getIdentityIds().filter((id) => id.isCanonicalKey()),
      this.getNodePeerIds(),
    );
  }

  public count(): number {
    return this.identityIds.size + this.nodePeerIds.size;
  }

  public getIdentityIds(): IdentityId[] {
    return [...this.identityIds.values()];
  }

  public getNodePeerIds(): NodePeerId[] {
    return [...this.nodePeerIds.values()];
  }

  /** Sorted, so equal sets serialize the same way. */
  public toPrimitives(): NodeBlockEntriesPrimitives {
    return {
      identityIds: [...this.identityIds.keys()].sort(),
      nodePeerIds: [...this.nodePeerIds.keys()].sort(),
    };
  }
}
