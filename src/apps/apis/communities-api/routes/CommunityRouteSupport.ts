import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

export abstract class CommunityRouteSupport extends Route {
  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected repository(): MongoCommunityRepository {
    return new MongoCommunityRepository(this.get<MongoDB>(MongoDB));
  }

  protected async findCommunity(id: string): Promise<Community> {
    const community = await this.repository().findById(new CommunityId(id));

    if (!community) {
      throw new CommunityNotFoundError();
    }

    return community;
  }
}
