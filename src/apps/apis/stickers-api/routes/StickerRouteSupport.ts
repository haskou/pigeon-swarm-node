import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerPackNotFoundError } from '@app/contexts/stickers/domain/errors/StickerPackNotFoundError';
import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { MongoStickerPackRepository } from '@app/contexts/stickers/infrastructure/mongo/MongoStickerPackRepository';
import { MongoStickerUserLibraryRepository } from '@app/contexts/stickers/infrastructure/mongo/MongoStickerUserLibraryRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

export abstract class StickerRouteSupport extends Route {
  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected repository(): MongoStickerPackRepository {
    return new MongoStickerPackRepository(this.get<MongoDB>(MongoDB));
  }

  protected libraryRepository(): MongoStickerUserLibraryRepository {
    return new MongoStickerUserLibraryRepository(this.get<MongoDB>(MongoDB));
  }

  protected async findLibrary(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary> {
    const library = await this.libraryRepository().findByIdentityId(identityId);

    return library ?? StickerUserLibrary.create(identityId);
  }

  protected async findPack(id: string): Promise<StickerPack> {
    const pack = await this.repository().findById(new StickerPackId(id));

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    return pack;
  }
}
