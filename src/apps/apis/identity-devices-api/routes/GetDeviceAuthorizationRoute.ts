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
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { DeviceAuthorizationRequestAuthenticator } from '../DeviceAuthorizationRequestAuthenticator';
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

  /** The authorization of the identity that signed the request for itself. */
  private async findForRequester(
    identityId: string,
    request: Request,
  ): Promise<DeviceAuthorization> {
    const requesterIdentityId = this.authenticator.authenticate(request);
    const targetIdentityId = new IdentityId(decodeURIComponent(identityId));

    assert(
      targetIdentityId.isEqual(requesterIdentityId),
      new InvalidSignedRequestError(),
    );

    return this.finder.find(
      new DeviceAuthorizationFindMessage(targetIdentityId),
    );
  }

  private async findForOwner(
    identityId: string,
    request: Request,
  ): Promise<DeviceAuthorization> {
    const authorization = await this.findForRequester(identityId, request);
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
   * The signed transitions the requesting device or recovery authority may
   * verify. A device the head no longer authorizes still reads the transitions
   * up to its removal, so it can verify that removal itself.
   */
  @Get('/:identityId/transitions')
  public async findTransitions(
    @Param('identityId') identityId: string,
    @QueryParam('after') after: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authorization = await this.findForRequester(identityId, request);
    const reader = this.deviceAuthenticator.authenticateReader(
      request,
      authorization,
    );
    const disclosure = await this.finder.findTransitionLog(
      new GetDeviceAuthorizationTransitionLogRequest(
        authorization.getIdentityId(),
        reader,
        after,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new DeviceAuthorizationTransitionLogViewModel(disclosure).toResource(),
      );
  }
}
