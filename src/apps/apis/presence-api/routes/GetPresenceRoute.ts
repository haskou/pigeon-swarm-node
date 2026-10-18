import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityPresenceFinder from '@app/contexts/presence/application/find/IdentityPresenceFinder';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import WebSocketClientMessageHandler from '@app/shared/infrastructure/websocket/WebSocketClientMessageHandler';
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

  private readonly clientMessageHandler =
    this.get<WebSocketClientMessageHandler>(WebSocketClientMessageHandler);

  /**
   * Identities that share a one-to-one conversation or community with the
   * viewer. Only they may read presence over HTTP, matching realtime identity
   * updates; sharing a group grants nothing.
   */
  private async sharedIdentityIdsOf(
    viewerIdentityId: IdentityId,
  ): Promise<Set<string>> {
    const recipients =
      await this.clientMessageHandler.findIdentityUpdateRecipients(
        viewerIdentityId.valueOf(),
      );

    return new Set(
      recipients.map((recipient) => new IdentityId(recipient).valueOf()),
    );
  }

  @Get()
  public async getPresences(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const viewerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const presences = await this.finder.find(
      new GetPresenceListRequest(
        viewerIdentityId.valueOf(),
        request.query,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityPresencesViewModel(
          presences,
          viewerIdentityId,
          await this.sharedIdentityIdsOf(viewerIdentityId),
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
    const sharesRelationship = (
      await this.sharedIdentityIdsOf(viewerIdentityId)
    ).has(new IdentityId(identityId).valueOf());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityPresenceViewModel(
          presence,
          viewerIdentityId,
          sharesRelationship,
        ).toResource(),
      );
  }
}
