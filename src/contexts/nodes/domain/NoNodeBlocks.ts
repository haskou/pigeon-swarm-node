import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NodeBlockListPrimitives } from './NodeBlockListPrimitives';
import { NodeBlocks } from './NodeBlocks';
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

  public toPrimitives(): NodeBlockListPrimitives | undefined {
    return undefined;
  }
}
