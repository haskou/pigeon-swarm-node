import { NodeBlocks } from '../../domain/NodeBlocks';
import { NoNodeBlocks } from '../../domain/NoNodeBlocks';
import NodeBlockListRepository from '../../domain/repositories/NodeBlockListRepository';
import NodeBlockPublicationRepository from '../../domain/repositories/NodeBlockPublicationRepository';

/** The owner's stored list when the owner chose to publish it; `NoNodeBlocks` otherwise. */
export default class PublishedNodeBlockListFinder {
  constructor(
    private readonly publicationRepository: NodeBlockPublicationRepository,
    private readonly listRepository: NodeBlockListRepository,
  ) {}

  public async find(): Promise<NodeBlocks> {
    const publication = await this.publicationRepository.find();

    if (!publication.isPublished()) {
      return new NoNodeBlocks();
    }

    return this.listRepository.findLocal();
  }
}
