import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { LocalNodeMetadataDocument } from '../documents/LocalNodeMetadataDocument';

export default class LocalNodeMetadataMapper {
  public toDomain(
    document: LocalNodeMetadataDocument,
  ): LocalNodeMetadataDocument {
    return {
      nodeId: new NodeId(document.nodeId).valueOf(),
      owner: document.owner,
    };
  }

  public toDocument(node: Node): LocalNodeMetadataDocument {
    const primitives = node.toPrimitives();

    return {
      nodeId: primitives.id,
      owner: primitives?.owner,
    };
  }

  public generate(): LocalNodeMetadataDocument {
    return {
      nodeId: NodeId.generate().valueOf(),
    };
  }
}
