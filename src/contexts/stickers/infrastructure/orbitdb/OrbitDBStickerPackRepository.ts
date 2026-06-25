import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import OrbitDBReplicatedStateRegistry from '../../../shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';
import { OrbitDBStickerPackDocument } from './documents/OrbitDBStickerPackDocument';

export default class OrbitDBStickerPackRepository extends StickerPackRepository {
  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBStickerPackDocument {
    return (
      typeof document.id === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.name === 'string' &&
      typeof document.ownerIdentityId === 'string' &&
      Array.isArray(document.stickers) &&
      typeof document.updatedAt === 'number'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toDocument(pack: StickerPack): OrbitDBStickerPackDocument {
    const primitives = pack.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      id: primitives.id,
      name: primitives.name,
      ownerIdentityId: primitives.ownerIdentityId,
      stickers: primitives.stickers,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(document: OrbitDBStickerPackDocument): StickerPack {
    return StickerPack.fromPrimitives(document);
  }

  private headKey(id: StickerPackId | string): string {
    const value = id instanceof StickerPackId ? id.valueOf() : id;

    return `sticker-pack:${value}`;
  }

  private ownerIndexHeadKey(ownerIdentityId: IdentityId | string): string {
    const value =
      ownerIdentityId instanceof IdentityId
        ? ownerIdentityId.valueOf()
        : ownerIdentityId;

    return `sticker-pack-owner-index:${value}`;
  }

  private documentsFromIndex(
    record: Record<string, unknown> | undefined,
  ): OrbitDBStickerPackDocument[] {
    const packs: unknown = record?.packs;

    if (!Array.isArray(packs)) {
      return [];
    }

    return (packs as unknown[])
      .filter(
        (document): document is OrbitDBStickerPackDocument =>
          this.isRecord(document) && this.isDocument(document),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private deduplicateDocuments(
    documents: OrbitDBStickerPackDocument[],
  ): OrbitDBStickerPackDocument[] {
    const deduplicated = new Map<string, OrbitDBStickerPackDocument>();

    for (const document of documents) {
      const current = deduplicated.get(document.id);

      if (!current || current.updatedAt <= document.updatedAt) {
        deduplicated.set(document.id, document);
      }
    }

    return [...deduplicated.values()];
  }

  private async putHeads(document: OrbitDBStickerPackDocument): Promise<void> {
    await this.registry.putHead(this.headKey(document.id), { ...document });

    const key = this.ownerIndexHeadKey(document.ownerIdentityId);
    const indexedDocuments = this.documentsFromIndex(
      await this.registry.findHead(key),
    );
    const packs = this.deduplicateDocuments([...indexedDocuments, document]);

    await this.registry.putHead(key, {
      id: key,
      ownerIdentityId: document.ownerIdentityId,
      packs: packs.map((pack) => ({ ...pack })),
      updatedAt: Date.now(),
    });
  }

  public async findAll(): Promise<StickerPack[]> {
    const documents = this.registry
      .findCachedHeadsByPrefix('sticker-pack:')
      .map((document) => (this.isDocument(document) ? document : undefined))
      .filter(
        (document): document is OrbitDBStickerPackDocument =>
          document !== undefined,
      )
      .sort((left, right) => right.updatedAt - left.updatedAt);

    return Promise.resolve(
      documents.map((document) => this.toDomain(document)),
    );
  }

  public async findById(id: StickerPackId): Promise<StickerPack | undefined> {
    const head = await this.registry.findHead(this.headKey(id));
    const document = head && this.isDocument(head) ? head : undefined;

    return document ? this.toDomain(document) : undefined;
  }

  public async findByOwner(
    ownerIdentityId: IdentityId,
  ): Promise<StickerPack[]> {
    const documents = this.documentsFromIndex(
      await this.registry.findHead(this.ownerIndexHeadKey(ownerIdentityId)),
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async save(pack: StickerPack): Promise<void> {
    const document = this.toDocument(pack);

    await this.registry.putDocument('stickerPacks', document);
    await this.putHeads(document);
  }
}
