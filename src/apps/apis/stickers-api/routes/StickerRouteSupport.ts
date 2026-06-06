import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerPacksFindMessage } from '@app/contexts/stickers/application/find-packs/messages/StickerPacksFindMessage';
import { StickerPacksFinder } from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { StickerPackRepository } from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import { StickerUserLibraryRepository } from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { MongoStickerPackRepository } from '@app/contexts/stickers/infrastructure/mongo/MongoStickerPackRepository';
import { MongoStickerUserLibraryRepository } from '@app/contexts/stickers/infrastructure/mongo/MongoStickerUserLibraryRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

import { StickerUserLibraryResource } from '../resources/StickerUserLibraryResource';
import { StickerUserLibraryViewModel } from '../view-model/StickerUserLibraryViewModel';

export abstract class StickerRouteSupport extends Route {
  protected readonly eventPublisher: DomainEventPublisher =
    this.get<MessageBus>(MessageBus);

  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected packRepository(): StickerPackRepository {
    return new MongoStickerPackRepository(this.get<MongoDB>(MongoDB));
  }

  protected libraryRepository(): StickerUserLibraryRepository {
    return new MongoStickerUserLibraryRepository(this.get<MongoDB>(MongoDB));
  }

  protected async libraryResource(
    library: StickerUserLibrary,
  ): Promise<StickerUserLibraryResource> {
    const packs = await new StickerPacksFinder(this.packRepository()).find(
      new StickerPacksFindMessage(),
    );

    return new StickerUserLibraryViewModel(library, packs).toResource();
  }
}
