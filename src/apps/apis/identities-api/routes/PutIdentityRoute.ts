import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityUpdateRequesterMismatchError } from '@app/contexts/identities/domain/errors/IdentityUpdateRequesterMismatchError';
import { InsufficientIdentityAdmissionProofError } from '@app/contexts/identities/domain/errors/InsufficientIdentityAdmissionProofError';
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
import IdentityAdmissionSourceRateLimiter from '../IdentityAdmissionSourceRateLimiter';
import IdentityCreationGate from '../IdentityCreationGate';
import IdentityNetworkAdmissionRateLimiter from '../IdentityNetworkAdmissionRateLimiter';
import IdentityPublishRateLimiter from '../IdentityPublishRateLimiter';
import { PutIdentityRequest } from '../requests/PutIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';
import { InsufficientAdmissionProofViewModel } from '../view-model/InsufficientAdmissionProofViewModel';

@JsonController('/identities')
export class PutIdentityRoute extends Route {
  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly sourceRateLimiter =
    this.get<IdentityAdmissionSourceRateLimiter>(
      IdentityAdmissionSourceRateLimiter,
    );

  private readonly rateLimiter = this.get<IdentityPublishRateLimiter>(
    IdentityPublishRateLimiter,
  );

  private readonly networkAdmissionRateLimiter =
    this.get<IdentityNetworkAdmissionRateLimiter>(
      IdentityNetworkAdmissionRateLimiter,
    );

  private readonly creationGate =
    this.get<IdentityCreationGate>(IdentityCreationGate);

  @Put('/:identityId')
  public async updateIdentity(
    @Param('identityId') identityId: string,
    @Body({
      options: { limit: '10mb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PutIdentityBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.sourceRateLimiter.consume(request.ip ?? 'unknown');

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

    try {
      const message = new PutIdentityRequest(body).getIdentityPublishMessage();
      // A PUT for an identity this node does not hold yet creates it, so it
      // passes the same registration control as a POST.
      const candidate = await this.creationGate.publish(
        message.identity,
        request.header('X-Registration-Code'),
        async () => {
          await this.rateLimiter.consume(authenticatedIdentityId);
          await this.networkAdmissionRateLimiter.consume(body.networks);

          return this.identityPublisher.publish(message);
        },
      );

      return response
        .status(HttpRouteStatusEnum.OK)
        .send(
          new IdentityViewModel(
            candidate.getIdentity(),
            candidate.getExternalIdentifier(),
          ).toResource(),
        );
    } catch (error: unknown) {
      if (error instanceof InsufficientIdentityAdmissionProofError) {
        return response
          .status(HttpRouteStatusEnum.BAD_REQUEST)
          .json(new InsufficientAdmissionProofViewModel(error).toResource());
      }

      throw error;
    }
  }
}
