import { NodeBlockPublication } from '@app/contexts/nodes/domain/NodeBlockPublication';
import NodeBlockPublicationRepository from '@app/contexts/nodes/domain/repositories/NodeBlockPublicationRepository';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalNodeBlockPublicationDocument } from './documents/LocalNodeBlockPublicationDocument';

export default class LocalNodeBlockPublicationRepository extends NodeBlockPublicationRepository {
  private static readonly NAMESPACE = 'node_block_publication';
  private static readonly LOCAL_ID = 'local';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  public async find(): Promise<NodeBlockPublication> {
    const document = await this.database.findOne(
      LocalNodeBlockPublicationRepository.NAMESPACE,
      LocalNodeBlockPublicationRepository.LOCAL_ID,
    );

    if (!document) {
      return NodeBlockPublication.unpublished();
    }

    return new NodeBlockPublication(
      (document as LocalNodeBlockPublicationDocument).published,
    );
  }

  public async save(publication: NodeBlockPublication): Promise<void> {
    const document: LocalNodeBlockPublicationDocument = {
      _id: LocalNodeBlockPublicationRepository.LOCAL_ID,
      published: publication.isPublished(),
    };

    await this.database.save(
      LocalNodeBlockPublicationRepository.NAMESPACE,
      LocalNodeBlockPublicationRepository.LOCAL_ID,
      document,
    );
  }

  public async resetOwnerSettings(): Promise<ClearedNodeOwnerSetting[]> {
    const publication = await this.find();

    if (!publication.isPublished()) {
      return [];
    }

    await this.database.delete(
      LocalNodeBlockPublicationRepository.NAMESPACE,
      LocalNodeBlockPublicationRepository.LOCAL_ID,
    );

    return [ClearedNodeOwnerSetting.blockListPublication()];
  }
}
