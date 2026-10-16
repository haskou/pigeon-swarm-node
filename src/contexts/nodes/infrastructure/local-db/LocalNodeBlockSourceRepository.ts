import { NodeBlockSourceNotFoundError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceNotFoundError';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalNodeBlockSourceDocument } from './documents/LocalNodeBlockSourceDocument';

/** Adopted block sources, keyed by the publisher identity they are pinned to. */
export default class LocalNodeBlockSourceRepository extends NodeBlockSourceRepository {
  private static readonly NAMESPACE = 'node_block_sources';

  private static toSource(document: Record<string, unknown>): NodeBlockSource {
    return NodeBlockSource.fromPrimitives(
      (document as LocalNodeBlockSourceDocument).source,
    );
  }

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  public async findAll(): Promise<NodeBlockSource[]> {
    const documents = await this.database.find(
      LocalNodeBlockSourceRepository.NAMESPACE,
    );

    return documents.map((document) =>
      LocalNodeBlockSourceRepository.toSource(document),
    );
  }

  public async find(ownerIdentityId: IdentityId): Promise<NodeBlockSource> {
    const document = await this.database.findOne(
      LocalNodeBlockSourceRepository.NAMESPACE,
      ownerIdentityId.valueOf(),
    );

    if (!document) {
      throw new NodeBlockSourceNotFoundError();
    }

    return LocalNodeBlockSourceRepository.toSource(document);
  }

  public async exists(ownerIdentityId: IdentityId): Promise<boolean> {
    const document = await this.database.findOne(
      LocalNodeBlockSourceRepository.NAMESPACE,
      ownerIdentityId.valueOf(),
    );

    return document !== undefined;
  }

  public async save(source: NodeBlockSource): Promise<void> {
    const id = source.getOwnerIdentityId().valueOf();
    const document: LocalNodeBlockSourceDocument = {
      _id: id,
      source: source.toPrimitives(),
    };

    await this.database.save(
      LocalNodeBlockSourceRepository.NAMESPACE,
      id,
      document,
    );
  }

  public async delete(ownerIdentityId: IdentityId): Promise<void> {
    await this.database.delete(
      LocalNodeBlockSourceRepository.NAMESPACE,
      ownerIdentityId.valueOf(),
    );
  }

  public async resetOwnerSettings(): Promise<ClearedNodeOwnerSetting[]> {
    const sources = await this.findAll();

    for (const source of sources) {
      await this.delete(source.getOwnerIdentityId());
    }

    return sources.map((source) => ClearedNodeOwnerSetting.blockSource(source));
  }
}
