import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerPacksFindMessage } from '@app/contexts/stickers/application/find-packs/messages/StickerPacksFindMessage';
import StickerPacksFinder from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

import { StickerUserLibraryResource } from '../resources/StickerUserLibraryResource';
import { StickerUserLibraryViewModel } from '../view-model/StickerUserLibraryViewModel';

export abstract class StickerRouteSupport extends Route {
  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly packsFinder =
    this.get<StickerPacksFinder>(StickerPacksFinder);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected async libraryResource(
    library: StickerUserLibrary,
  ): Promise<StickerUserLibraryResource> {
    const packs = await this.packsFinder.find(new StickerPacksFindMessage());

    return new StickerUserLibraryViewModel(library, packs).toResource();
  }
}
