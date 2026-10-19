import { DomainError } from '@haskou/value-objects';

export class NodeMetadataIsUnreadableError extends DomainError {
  constructor() {
    super(
      'The stored node configuration cannot be read, so the node cannot start, and nothing was changed. To keep this node, stop it and restore the PIGEON_LOCAL_DB_PATH folder from a backup. To start over instead, stop it and delete that folder explicitly: the node then starts as a new, unclaimed node without its networks.',
    );
  }
}
