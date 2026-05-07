import { Node } from '@app/contexts/nodes/domain/Node';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

import { MongoNodeMetadataDocument } from '../documents/MongoNodeMetadataDocument';

export default class MongoNodeMetadataMapper {
  private static LOCAL_NODE_ID: MongoNodeMetadataDocument['_id'] = 'local';

  public toDocument(node: Node): MongoNodeMetadataDocument {
    const primitives = node.toPrimitives();

    return {
      _id: MongoNodeMetadataMapper.LOCAL_NODE_ID,
      networks: primitives.networks,
      nodeId: primitives.id,
      owner: primitives.owner,
    };
  }

  public generate(): MongoNodeMetadataDocument {
    return {
      _id: MongoNodeMetadataMapper.LOCAL_NODE_ID,
      networks: {},
      nodeId: NodeId.generate().valueOf(),
    };
  }
}
