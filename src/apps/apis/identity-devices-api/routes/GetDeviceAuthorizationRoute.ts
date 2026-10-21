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
   * The signed transitions of any identity, for any signed caller: a sender
   * replays them to verify the sealing view it was served. Rate-limited per
   * requester, so one caller cannot exhaust another's reads. This discloses the
   * add and remove history of the device set, an accepted waiver.
   */
  @Get('/:identityId/transitions')
  public async findTransitions(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requester = await this.authenticator.authenticate(request);
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
