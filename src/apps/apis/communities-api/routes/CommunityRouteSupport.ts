import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { CommunityFindMessage } from '@app/contexts/communities/application/find-community/messages/CommunityFindMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';

export abstract class CommunityRouteSupport extends Route {
  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly communityFinder = this.get<CommunityFinder>(CommunityFinder);

  protected authenticate(request: Request): IdentityId {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected async findCommunity(id: string): Promise<Community> {
    return this.communityFinder.find(new CommunityFindMessage(id));
  }
}
