import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';

export abstract class PrivateAuthorizationRouteSupport extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.authenticator.authenticate(request);
  }
}
