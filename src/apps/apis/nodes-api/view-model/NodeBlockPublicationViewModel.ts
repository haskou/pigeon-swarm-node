import { NodeBlockPublication } from '@app/contexts/nodes/domain/NodeBlockPublication';

import { NodeBlockPublicationResource } from '../resources/NodeBlockPublicationResource';

export class NodeBlockPublicationViewModel {
  constructor(private readonly publication: NodeBlockPublication) {}

  public toResource(): NodeBlockPublicationResource {
    return this.publication.toPrimitives();
  }
}
