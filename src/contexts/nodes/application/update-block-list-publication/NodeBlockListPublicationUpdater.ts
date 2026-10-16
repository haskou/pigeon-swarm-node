import { NodeBlockPublication } from '../../domain/NodeBlockPublication';
import NodeBlockPublicationRepository from '../../domain/repositories/NodeBlockPublicationRepository';
import { NodeBlockListPublicationUpdaterMessage } from './messages/NodeBlockListPublicationUpdaterMessage';

/** Turns serving the owner's block list to other nodes on or off. */
export default class NodeBlockListPublicationUpdater {
  constructor(private readonly repository: NodeBlockPublicationRepository) {}

  public async update(
    message: NodeBlockListPublicationUpdaterMessage,
  ): Promise<NodeBlockPublication> {
    await this.repository.save(message.publication);

    return message.publication;
  }
}
