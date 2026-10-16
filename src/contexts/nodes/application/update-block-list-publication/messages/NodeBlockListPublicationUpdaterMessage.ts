import { NodeBlockPublication } from '@app/contexts/nodes/domain/NodeBlockPublication';

export class NodeBlockListPublicationUpdaterMessage {
  public readonly publication: NodeBlockPublication;

  constructor(published: boolean) {
    this.publication = new NodeBlockPublication(published);
  }
}
