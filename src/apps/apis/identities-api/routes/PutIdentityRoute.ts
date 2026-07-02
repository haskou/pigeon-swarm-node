import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityUpdateRequesterMismatchError } from '@app/contexts/identities/domain/errors/IdentityUpdateRequesterMismatchError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutIdentityBody } from '../bodies/PutIdentityBody';
import { PutIdentityRequest } from '../requests/PutIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';

@JsonController('/identities')
export class PutIdentityRoute extends Route {
  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Put('/:identityId')
  public async updateIdentity(
    @Param('identityId') identityId: string,
    @Body({ options: { limit: '10mb' } }) body: PutIdentityBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const requestedIdentityId = new IdentityId(decodeURIComponent(identityId));
    const bodyIdentityId = new IdentityId(body.id);

    if (
      authenticatedIdentityId.isNotEqual(requestedIdentityId) ||
      authenticatedIdentityId.isNotEqual(bodyIdentityId)
    ) {
      throw new IdentityUpdateRequesterMismatchError();
    }

    const candidate = await this.identityPublisher.publish(
      new PutIdentityRequest(body).getIdentityPublishMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityViewModel(
          candidate.getIdentity(),
          candidate.getExternalIdentifier(),
        ).toResource(),
      );
  }
}
