import { NodeBlockPublication } from '../../domain/NodeBlockPublication';
import NodeBlockPublicationRepository from '../../domain/repositories/NodeBlockPublicationRepository';

export default class NodeBlockListPublicationFinder {
  constructor(private readonly repository: NodeBlockPublicationRepository) {}

  public async find(): Promise<NodeBlockPublication> {
    return this.repository.find();
  }
}
