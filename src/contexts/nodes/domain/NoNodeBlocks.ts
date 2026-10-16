import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodeBlocks } from './NodeBlocks';
import { SignedNodeBlockList } from './SignedNodeBlockList';
import { NodePeerId } from './value-objects/NodePeerId';

/** Null Object for a node whose owner never stored a block list: it blocks nobody. */
export class NoNodeBlocks extends NodeBlocks {
  public acceptsReplacement(): boolean {
    return true;
  }

  public blocksIdentity(): boolean {
    return false;
  }

  public getBlockedIdentityIds(): IdentityId[] {
    return [];
  }

  public getBlockedNodePeerIds(): NodePeerId[] {
    return [];
  }

  public isVersion(): boolean {
    return false;
  }

  public toPrimitives(): NodeBlockListPrimitives | undefined {
    return undefined;
  }

  public toSigned(): SignedNodeBlockList | undefined {
    return undefined;
  }
}
