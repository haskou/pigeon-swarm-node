import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import StickerPacksFinder from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';

import { StickerLibraryPageRequest } from '../requests/StickerLibraryPageRequest';
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

  /** The library with its first page of each paged array, unless `page` says otherwise. */
  protected async libraryResource(
    library: StickerUserLibrary,
    page: StickerLibraryPageRequest = StickerLibraryPageRequest.first(),
  ): Promise<StickerUserLibraryResource> {
    const packs = await this.packsFinder.findAll();

    return new StickerUserLibraryViewModel(library, packs, page).toResource();
  }
}
