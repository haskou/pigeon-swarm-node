import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

export abstract class CallRouteSupport extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }
}
