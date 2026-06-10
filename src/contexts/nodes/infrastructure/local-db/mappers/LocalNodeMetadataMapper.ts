import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { LocalNodeMetadataDocument } from '../documents/LocalNodeMetadataDocument';

export default class LocalNodeMetadataMapper {
  private static readonly LOCAL_NODE_ID: LocalNodeMetadataDocument['_id'] =
    'local';

  public toDocument(node: Node): LocalNodeMetadataDocument {
    const primitives = node.toPrimitives();

    return {
      _id: LocalNodeMetadataMapper.LOCAL_NODE_ID,
      networks: primitives.networks,
      nodeId: primitives.id,
      owner: primitives.owner,
    };
  }

  public generate(): LocalNodeMetadataDocument {
    return {
      _id: LocalNodeMetadataMapper.LOCAL_NODE_ID,
      networks: {},
      nodeId: NodeId.generate().valueOf(),
    };
  }
}
