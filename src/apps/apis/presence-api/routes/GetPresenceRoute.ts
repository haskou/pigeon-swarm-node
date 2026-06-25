import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityPresenceFinder from '@app/contexts/presence/application/find/IdentityPresenceFinder';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { GetPresenceListRequest } from '../requests/GetPresenceListRequest';
import { GetPresenceRequest } from '../requests/GetPresenceRequest';
import { IdentityPresencesViewModel } from '../view-model/IdentityPresencesViewModel';
import { IdentityPresenceViewModel } from '../view-model/IdentityPresenceViewModel';

@JsonController('/presence')
export class GetPresenceRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly finder = this.get<IdentityPresenceFinder>(
    IdentityPresenceFinder,
  );

  private identityIdsFrom(request: Request): string | string[] | undefined {
    const { identityIds } = request.query;

    if (Array.isArray(identityIds)) {
      return identityIds.map(String);
    }

    return typeof identityIds === 'string' ? identityIds : undefined;
  }

  @Get('/')
  public async getPresences(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const viewerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const presences = await this.finder.find(
      new GetPresenceListRequest(
        viewerIdentityId.valueOf(),
        this.identityIdsFrom(request),
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityPresencesViewModel(
          presences,
          viewerIdentityId,
        ).toResource(),
      );
  }

  @Get('/:identityId')
  public async getPresence(
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const viewerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const [presence] = await this.finder.find(
      new GetPresenceRequest(
        viewerIdentityId.valueOf(),
        identityId,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityPresenceViewModel(presence, viewerIdentityId).toResource(),
      );
  }
}
