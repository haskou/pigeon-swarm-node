import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import DeviceAuthorizationFinder from '@app/contexts/identity-devices/application/find/DeviceAuthorizationFinder';
import { DeviceAuthorizationFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationFindMessage';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { assert } from '@haskou/value-objects';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { DeviceAuthorizationRequestAuthenticator } from '../DeviceAuthorizationRequestAuthenticator';
import DeviceAuthorizationTransitionClientRateLimiter from '../DeviceAuthorizationTransitionClientRateLimiter';
import DeviceAuthorizationTransitionReadRateLimiter from '../DeviceAuthorizationTransitionReadRateLimiter';
import { GetDeviceAuthorizationTransitionLogRequest } from '../requests/GetDeviceAuthorizationTransitionLogRequest';
import { DeviceAuthorizationTransitionLogViewModel } from '../view-model/DeviceAuthorizationTransitionLogViewModel';
import { DeviceAuthorizationViewModel } from '../view-model/DeviceAuthorizationViewModel';
import { DeviceCatalogViewModel } from '../view-model/DeviceCatalogViewModel';

@JsonController('/identity-devices')
export class GetDeviceAuthorizationRoute extends Route {
  private readonly deviceAuthenticator =
    new DeviceAuthorizationRequestAuthenticator();

  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly finder = this.get<DeviceAuthorizationFinder>(
    DeviceAuthorizationFinder,
  );

  private readonly transitionClientRateLimiter =
    this.get<DeviceAuthorizationTransitionClientRateLimiter>(
      DeviceAuthorizationTransitionClientRateLimiter,
    );

  private readonly transitionReadRateLimiter =
    this.get<DeviceAuthorizationTransitionReadRateLimiter>(
      DeviceAuthorizationTransitionReadRateLimiter,
    );

  /** The identity that signed the request for itself. */
  private async authenticateRequester(
    identityId: string,
    request: Request,
  ): Promise<IdentityId> {
    const requesterIdentityId = await this.authenticator.authenticate(request);
    const targetIdentityId = new IdentityId(decodeURIComponent(identityId));

    assert(
      targetIdentityId.isEqual(requesterIdentityId),
      new InvalidSignedRequestError(),
    );

    return targetIdentityId;
  }

  private async findForOwner(
    identityId: string,
    request: Request,
  ): Promise<DeviceAuthorization> {
    const authorization = await this.finder.find(
      new DeviceAuthorizationFindMessage(
        await this.authenticateRequester(identityId, request),
      ),
    );
    this.deviceAuthenticator.authenticate(request, authorization);

    return authorization;
  }

  @Get('/:identityId')
  public async find(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorization = await this.findForOwner(identityId, request);
    const compromisedSince = await this.finder.findCompromisedSince(
      new DeviceAuthorizationFindMessage(authorization.getIdentityId()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new DeviceAuthorizationViewModel(
          authorization,
          compromisedSince,
        ).toResource(),
      );
  }

  @Get('/:identityId/devices')
  public async findDevices(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorization = await this.findForOwner(identityId, request);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new DeviceCatalogViewModel(authorization).toResource());
  }

  /**
   * The signed transition log of any identity this node serves, for a caller
   * this node serves: a sender replays it to verify the sealing view it was
   * served. Any self-generated key can sign, so a signer this node does not
   * serve is refused (403014). A served caller reads the full history:
   * authorization times, compromise marks and compromised credentials, pairing
   * ids and expirations, operation ids, epochs, and the credentials of removed
   * devices and recoveries. Spent in order: the client address, the signature,
   * the served check, then the requester budget keyed on its canonical id.
   */
  @Get('/:identityId/transitions')
  public async findTransitions(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.transitionClientRateLimiter.consume(request.ip);
    const requester = await this.authenticator.authenticateServed(request);
    this.transitionReadRateLimiter.consume(requester);
    const page = GetDeviceAuthorizationTransitionLogRequest.fromQuery(
      request.query,
    );
    const log = await this.finder.findTransitionLog(
      new DeviceAuthorizationFindMessage(
        new IdentityId(decodeURIComponent(identityId)),
      ),
    );
    const disclosure = log.disclose().page(page.getCursor(), page.getLimit());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new DeviceAuthorizationTransitionLogViewModel(disclosure).toResource(),
      );
  }
}
