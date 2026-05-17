import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { MongoIdentityMetadataRepository } from '@app/contexts/identities/infrastructure/mongo';
import { IdentityPresenceServicesFactory } from '@app/contexts/presence/application/IdentityPresenceServicesFactory';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { GetPresenceListRequest } from '../requests/GetPresenceListRequest';
import { GetPresenceRequest } from '../requests/GetPresenceRequest';
import { IdentityPresencesViewModel } from '../view-model/IdentityPresencesViewModel';
import { IdentityPresenceViewModel } from '../view-model/IdentityPresenceViewModel';

@JsonController('/presence')
export class GetPresenceRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private presenceServices(): IdentityPresenceServicesFactory {
    return new IdentityPresenceServicesFactory(
      this.get<MongoDB>(MongoDB),
      this.get<MongoIdentityMetadataRepository>(
        MongoIdentityMetadataRepository,
      ),
      this.get<MessageBus>(MessageBus),
    );
  }

  @Get('/')
  public async getPresences(
    @QueryParam('identityIds') identityIds: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const viewerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const presences = await this.presenceServices()
      .finder()
      .find(
        new GetPresenceListRequest(
          viewerIdentityId.valueOf(),
          identityIds,
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
    const [presence] = await this.presenceServices()
      .finder()
      .find(
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
