import { NodeBlockSource } from '../../domain/NodeBlockSource';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';

export default class NodeBlockSourcesFinder {
  constructor(private readonly repository: NodeBlockSourceRepository) {}

  public async find(): Promise<NodeBlockSource[]> {
    return this.repository.findAll();
  }
}
