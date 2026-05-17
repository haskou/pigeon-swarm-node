import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { MongoIdentityMetadataRepository } from '@app/contexts/identities/infrastructure/mongo';
import { IdentityPresenceServicesFactory } from '@app/contexts/presence/application/IdentityPresenceServicesFactory';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutPresenceBody } from '../bodies/PutPresenceBody';
import { PutPresenceRequest } from '../requests/PutPresenceRequest';
import { IdentityPresenceViewModel } from '../view-model/IdentityPresenceViewModel';

@JsonController('/presence')
export class PutPresenceRoute extends Route {
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

  @Put('/me')
  public async putPresence(
    @Body() body: PutPresenceBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const presence = await this.presenceServices()
      .updater()
      .update(new PutPresenceRequest(identityId.valueOf(), body).getMessage());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new IdentityPresenceViewModel(presence, identityId).toResource());
  }
}
