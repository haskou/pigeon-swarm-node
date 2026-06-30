import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBHeadIndex from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';

import OrbitDBReplicatedStateRegistry from '../../../shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';
import { OrbitDBStickerPackDocument } from './documents/OrbitDBStickerPackDocument';

export default class OrbitDBStickerPackRepository extends StickerPackRepository {
  private readonly packIndex: OrbitDBHeadIndex<OrbitDBStickerPackDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.packIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'packs',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        current.updatedAt <= candidate.updatedAt,
    });
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

  private sortByUpdatedAtDescending(
    documents: OrbitDBStickerPackDocument[],
  ): OrbitDBStickerPackDocument[] {
    return [...documents].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    );
  }

  private async putHeads(document: OrbitDBStickerPackDocument): Promise<void> {
    await this.registry.putHead(this.headKey(document.id), { ...document });

    const key = this.ownerIndexHeadKey(document.ownerIdentityId);
    const packs = this.packIndex.deduplicate([
      ...((await this.packIndex.find(key)) ?? []),
      document,
    ]);

    await this.packIndex.putDocuments(
      key,
      {
        id: key,
        ownerIdentityId: document.ownerIdentityId,
      },
      packs,
    );
  }

  public async findAll(): Promise<StickerPack[]> {
    const documents = this.sortByUpdatedAtDescending(
      this.packIndex.deduplicate(
        this.registry
          .findCachedHeadsByPrefix('sticker-pack:')
          .map((document) => (this.isDocument(document) ? document : undefined))
          .filter(
            (document): document is OrbitDBStickerPackDocument =>
              document !== undefined,
          ),
      ),
    );

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
    const documents = this.sortByUpdatedAtDescending(
      (await this.packIndex.find(this.ownerIndexHeadKey(ownerIdentityId))) ??
        [],
    );

    return documents.map((document) => this.toDomain(document));
  }

  public async save(pack: StickerPack): Promise<void> {
    const document = this.toDocument(pack);

    await this.registry.putDocument('stickerPacks', document);
    await this.putHeads(document);
  }
}
