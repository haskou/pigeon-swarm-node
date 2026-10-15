import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import type { NodeBlockList } from './NodeBlockList';

import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodePeerId } from './value-objects/NodePeerId';

/** What this node's own block list blocks; `NoNodeBlocks` stands for no stored list. */
export abstract class NodeBlocks {
  public abstract acceptsReplacement(list: NodeBlockList): boolean;
  public abstract blocksIdentity(identityId: IdentityId): boolean;
  public abstract getBlockedIdentityIds(): IdentityId[];
  public abstract getBlockedNodePeerIds(): NodePeerId[];
  public abstract toPrimitives(): NodeBlockListPrimitives | undefined;
}
