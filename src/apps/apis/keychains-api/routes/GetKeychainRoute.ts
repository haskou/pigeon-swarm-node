import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { KeychainViewModel } from '../view-model/KeychainViewModel';

@JsonController('/keychains')
export class GetKeychainRoute extends Route {
  private readonly finder: CurrentKeychainFinder =
    this.get<CurrentKeychainFinder>(CurrentKeychainFinder);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Get('/:identityId')
  public async getKeychain(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const parsedIdentityId = decodeURIComponent(identityId);
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const ownerIdentityId = new IdentityId(parsedIdentityId);

    if (!ownerIdentityId.isEqual(requesterIdentityId)) {
      throw new InvalidSignedRequestError();
    }

    const keychain = await this.finder.find(
      new CurrentKeychainFindMessage(parsedIdentityId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new KeychainViewModel(keychain).toResource());
  }
}
