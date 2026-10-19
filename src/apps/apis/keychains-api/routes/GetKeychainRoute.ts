import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeReadiness from '@app/apps/NodeReadiness';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { CurrentKeychainFindMessage } from '@app/contexts/keychains/application/find-current/messages/CurrentKeychainFindMessage';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { KeychainViewModel } from '../view-model/KeychainViewModel';

@JsonController('/keychains')
export class GetKeychainRoute extends Route {
  private readonly finder: CurrentKeychainFinder =
    this.get<CurrentKeychainFinder>(CurrentKeychainFinder);

  private readonly readiness: NodeReadiness =
    this.get<NodeReadiness>(NodeReadiness);

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

    // Not ready means the node is still starting, a configured network has not
    // finished opening its replicated state, or its configuration is unreadable.
    // The caller retries.
    if (!(await this.readiness.isReady())) {
      throw new ReplicatedStateNotReadyError();
    }

    // Keychains are per network. A ready node with no registered network has
    // none, so the miss is genuine and nothing needs to be looked up.
    if (!this.readiness.hasNetworks()) {
      throw new KeychainNotFoundError(ownerIdentityId);
    }

    const keychain = await this.finder.find(
      new CurrentKeychainFindMessage(parsedIdentityId),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new KeychainViewModel(keychain).toResource());
  }
}
