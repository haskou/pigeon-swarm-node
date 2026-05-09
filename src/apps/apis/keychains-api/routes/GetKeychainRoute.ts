import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { KeychainViewModel } from '../view-model/KeychainViewModel';

@JsonController('/keychains')
export class GetKeychainRoute extends Route {
  private readonly finder: CurrentKeychainFinder =
    this.get<CurrentKeychainFinder>(CurrentKeychainFinder);

  private readonly signedRequestVerifier = new SignedHttpRequestVerifier();

  @Get('/:identityId')
  public async getKeychain(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = this.signedRequestVerifier.verify(request);
    const ownerIdentityId = new IdentityId(identityId);

    if (!ownerIdentityId.isEqual(requesterIdentityId)) {
      throw new InvalidSignedRequestError();
    }

    const keychain = await this.finder.find(
      new CurrentKeychainFindMessage(identityId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new KeychainViewModel(keychain).toResource());
  }
}
