import { NonCanonicalIdentityIdError } from '@app/apps/apis/shared/errors/NonCanonicalIdentityIdError';
import { NodePeerId } from '@app/contexts/nodes/domain/value-objects/NodePeerId';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

/**
 * Parsers for the position of each node list. Each throws unless the position
 * is one the list itself would have produced, so a cursor cannot name a
 * position outside the list it was issued for.
 */
export class NodeListPositions {
  public static identityId(position: string): IdentityId {
    const identityId = new IdentityId(position);

    if (!identityId.isCanonicalKey()) {
      throw new NonCanonicalIdentityIdError();
    }

    return identityId;
  }

  public static nodeId(position: string): NodeId {
    return new NodeId(position);
  }

  public static nodePeerId(position: string): NodePeerId {
    return new NodePeerId(position);
  }

  public static registrationCodeId(position: string): NodeRegistrationCodeId {
    return new NodeRegistrationCodeId(position);
  }
}
