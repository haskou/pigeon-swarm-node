import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import { IdentityCreationDetectorMessage } from '@app/contexts/identities/application/detect-creation/messages/IdentityCreationDetectorMessage';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';
import { InsufficientIdentityAdmissionProofError } from '@app/contexts/identities/domain/errors/InsufficientIdentityAdmissionProofError';
import { NodeRegistrationAdmitterMessage } from '@app/contexts/nodes/application/admit-registration/messages/NodeRegistrationAdmitterMessage';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationCodeIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationIsClosedError } from '@app/contexts/nodes/domain/errors/NodeRegistrationIsClosedError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostIdentityBody } from '../bodies/PostIdentityBody';
import { IdentityCreationIsRefusedOnThisNodeError } from '../errors/IdentityCreationIsRefusedOnThisNodeError';
import IdentityAdmissionSourceRateLimiter from '../IdentityAdmissionSourceRateLimiter';
import IdentityCreationQueue from '../IdentityCreationQueue';
import IdentityNetworkAdmissionRateLimiter from '../IdentityNetworkAdmissionRateLimiter';
import IdentityPublishRateLimiter from '../IdentityPublishRateLimiter';
import { PostIdentityRequest } from '../requests/PostIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';
import { InsufficientAdmissionProofViewModel } from '../view-model/InsufficientAdmissionProofViewModel';

@JsonController('/identities')
export class PostIdentityRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

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

  private readonly creationDetector = this.get<IdentityCreationDetector>(
    IdentityCreationDetector,
  );

  private readonly registrationAdmitter = this.get<NodeRegistrationAdmitter>(
    NodeRegistrationAdmitter,
  );

  private readonly creationQueue = this.get<IdentityCreationQueue>(
    IdentityCreationQueue,
  );

  private async admitRegistration(
    message: IdentityPublishMessage,
    httpRequest: Request,
  ): Promise<NodeRegistrationReservation> {
    const isCreation = await this.creationDetector.isCreation(
      new IdentityCreationDetectorMessage(message.identity),
    );

    try {
      return await this.registrationAdmitter.admit(
        new NodeRegistrationAdmitterMessage(
          isCreation,
          httpRequest.header('X-Registration-Code'),
        ),
      );
    } catch (error: unknown) {
      if (
        error instanceof NodeRegistrationIsClosedError ||
        error instanceof NodeRegistrationCodeIsNotValidError
      ) {
        throw new IdentityCreationIsRefusedOnThisNodeError(error.message);
      }

      throw error;
    }
  }

  private async admitAndPublish(
    message: IdentityPublishMessage,
    body: PostIdentityBody,
    httpRequest: Request,
    response: Response,
  ): Promise<Response> {
    const reservation = await this.admitRegistration(message, httpRequest);

    try {
      await this.rateLimiter.consume(new IdentityId(body.id));
      await this.networkAdmissionRateLimiter.consume(body.networks);

      const candidate = await this.identityPublisher.publish(message);
      const viewModel = new IdentityViewModel(
        candidate.getIdentity(),
        candidate.getExternalIdentifier(),
      );

      return response
        .status(HttpRouteStatusEnum.OK)
        .send(viewModel.toResource());
    } catch (error: unknown) {
      // A failure after the identity was saved (charge, event publish) still
      // created it, so its code use stays spent.
      if (
        await this.creationDetector.isCreation(
          new IdentityCreationDetectorMessage(message.identity),
        )
      ) {
        await this.registrationAdmitter.release(reservation);
      }

      if (error instanceof InsufficientIdentityAdmissionProofError) {
        return response
          .status(HttpRouteStatusEnum.BAD_REQUEST)
          .json(new InsufficientAdmissionProofViewModel(error).toResource());
      }

      throw error;
    }
  }

  @Post('/')
  public async createIdentity(
    @Body({
      options: { limit: '10mb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PostIdentityBody,
    @Req() httpRequest: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.sourceRateLimiter.consume(httpRequest.ip ?? 'unknown');
    // Building the message verifies the identity's signature.
    const message = new PostIdentityRequest(body).getIdentityPublishMessage();

    // A replay of a record this node holds, public at GET /identities/:id,
    // gets the usual republish answer, so it cannot reveal the block. Every
    // other record, forks of an equal or older version included, is checked.
    if (
      !(await this.creationDetector.holdsRecord(
        new IdentityCreationDetectorMessage(message.identity),
      ))
    ) {
      await this.signedRequestAuthenticator.assertIsNotBlocked(
        new IdentityId(body.id),
      );
    }

    return this.creationQueue.run(message.identity.getId(), () =>
      this.admitAndPublish(message, body, httpRequest, response),
    );
  }
}
