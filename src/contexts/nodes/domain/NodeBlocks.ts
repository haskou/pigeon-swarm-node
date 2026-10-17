import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import type { NodeBlockList } from './NodeBlockList';

import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { SignedNodeBlockList } from './SignedNodeBlockList';
import { NodeBlockListVersion } from './value-objects/NodeBlockListVersion';
import { NodePeerId } from './value-objects/NodePeerId';

/** What a block list blocks; `NoNodeBlocks` stands for no stored or fetched list. */
export abstract class NodeBlocks {
  public abstract acceptsReplacement(list: NodeBlockList): boolean;
  public abstract blocksIdentity(identityId: IdentityId): boolean;
  public abstract getBlockedIdentityIds(): IdentityId[];
  public abstract getBlockedNodePeerIds(): NodePeerId[];
  public abstract isVersion(version: NodeBlockListVersion): boolean;
  public abstract namesOnlyCanonicalIdentityIds(): boolean;
  public abstract toPrimitives(): NodeBlockListPrimitives | undefined;
  public abstract toSigned(): SignedNodeBlockList | undefined;
}
