import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalNodePeerDocument } from './documents/LocalNodePeerDocument';

export default class LocalNodePeerRepository extends NodePeerRepository {
  private static readonly NAMESPACE = 'node_peers';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalNodePeerDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.lastSeenAt === 'number' &&
      Array.isArray(document.networks) &&
      (document.owner === undefined || typeof document.owner === 'string')
    );
  }

  private toDocument(peer: NodePeer): LocalNodePeerDocument {
    const primitives = peer.toPrimitives();

    return {
      _id: primitives.id,
      lastSeenAt: primitives.lastSeenAt,
      networks: primitives.networks,
      owner: primitives.owner,
    };
  }

  private toDomain(document: LocalNodePeerDocument): NodePeer {
    return NodePeer.fromPrimitives({
      id: document._id,
      lastSeenAt: document.lastSeenAt,
      networks: document.networks,
      owner: document.owner,
    });
  }

  public async findActive(since: Date): Promise<NodePeer[]> {
    const documents = await this.database.find(
      LocalNodePeerRepository.NAMESPACE,
      (document) =>
        this.isDocument(document) && document.lastSeenAt >= since.getTime(),
    );

    return documents
      .filter((document): document is LocalNodePeerDocument =>
        this.isDocument(document),
      )
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
      .map((document) => this.toDomain(document));
  }

  public async save(peer: NodePeer): Promise<void> {
    const document = this.toDocument(peer);

    await this.database.save(
      LocalNodePeerRepository.NAMESPACE,
      document._id,
      document,
    );
  }
}
