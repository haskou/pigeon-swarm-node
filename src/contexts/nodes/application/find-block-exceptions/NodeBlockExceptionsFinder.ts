import { NodeBlockEntries } from '../../domain/NodeBlockEntries';
import NodeBlockExceptionsRepository from '../../domain/repositories/NodeBlockExceptionsRepository';

export default class NodeBlockExceptionsFinder {
  constructor(private readonly repository: NodeBlockExceptionsRepository) {}

  public async find(): Promise<NodeBlockEntries> {
    return this.repository.find();
  }
}
