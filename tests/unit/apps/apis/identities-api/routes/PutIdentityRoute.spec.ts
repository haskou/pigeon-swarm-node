import { PutIdentityBody } from '@app/apps/apis/identities-api/bodies/PutIdentityBody';
import { IdentityCreationIsRefusedOnThisNodeError } from '@app/apps/apis/identities-api/errors/IdentityCreationIsRefusedOnThisNodeError';
import IdentityAdmissionSourceRateLimiter from '@app/apps/apis/identities-api/IdentityAdmissionSourceRateLimiter';
import IdentityNetworkAdmissionRateLimiter from '@app/apps/apis/identities-api/IdentityNetworkAdmissionRateLimiter';
import IdentityPublishRateLimiter from '@app/apps/apis/identities-api/IdentityPublishRateLimiter';
import { PutIdentityRoute } from '@app/apps/apis/identities-api/routes/PutIdentityRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { NodeRegistrationAdmitterMessage } from '@app/contexts/nodes/application/admit-registration/messages/NodeRegistrationAdmitterMessage';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationIsClosedError } from '@app/contexts/nodes/domain/errors/NodeRegistrationIsClosedError';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Kernel } from '@haskou/ddd-kernel';
import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

import { SignedIdentityMother } from '../../../../mothers/SignedIdentityMother';

const REGISTRATION_CODE = 'presented-code';

/**
 * A PUT for an identity this node does not hold yet creates it, so it passes
 * the node's registration control just like a POST.
 */
describe('PutIdentityRoute', () => {
  let creationDetector: MockProxy<IdentityCreationDetector>;
  let publisher: MockProxy<IdentityPublisher>;
  let registrationAdmitter: MockProxy<NodeRegistrationAdmitter>;
  let signed: SignedIdentityMother;
  let response: MockProxy<Response>;

  const put = async (): Promise<unknown> => {
    const identity = signed.build();
    const body = Object.assign(new PutIdentityBody(), identity.toPrimitives());
    const request = mock<Request>();
    request.header.mockReturnValue(REGISTRATION_CODE as never);

    return new PutIdentityRoute().updateIdentity(
      signed.id,
      body,
      request,
      response,
    );
  };

  beforeEach(async () => {
    signed = await SignedIdentityMother.create();
    creationDetector = mock<IdentityCreationDetector>();
    publisher = mock<IdentityPublisher>();
    registrationAdmitter = mock<NodeRegistrationAdmitter>();
    response = mock<Response>();
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);
    publisher.publish.mockImplementation((message) =>
      Promise.resolve(
        new IdentityCandidate(
          new IdentityExternalIdentifier('bafy-identity'),
          message.identity,
        ),
      ),
    );

    const authenticator = mock<SignedHttpRequestAuthenticator>();
    authenticator.authenticate.mockResolvedValue(new IdentityId(signed.id));

    const services = new Map<unknown, unknown>([
      [IdentityAdmissionSourceRateLimiter, mock()],
      [IdentityCreationDetector, creationDetector],
      [IdentityNetworkAdmissionRateLimiter, mock()],
      [IdentityPublishRateLimiter, mock()],
      [IdentityPublisher, publisher],
      [NodeRegistrationAdmitter, registrationAdmitter],
      [SignedHttpRequestAuthenticator, authenticator],
    ]);
    new Kernel({
      di: { getService: (service: unknown) => services.get(service) } as never,
    });
  });

  it('should refuse to create an identity on a node closed for registration', async () => {
    creationDetector.isCreation.mockResolvedValue(true);
    registrationAdmitter.admit.mockRejectedValue(
      new NodeRegistrationIsClosedError(),
    );

    await expect(put()).rejects.toThrow(
      IdentityCreationIsRefusedOnThisNodeError,
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('should spend one use of the presented registration code on a creation', async () => {
    creationDetector.isCreation.mockResolvedValue(true);
    registrationAdmitter.admit.mockResolvedValue(
      new NodeRegistrationReservation(NodeRegistrationCodeId.generate()),
    );

    await put();

    expect(registrationAdmitter.admit).toHaveBeenCalledWith(
      new NodeRegistrationAdmitterMessage(true, REGISTRATION_CODE),
    );
    expect(publisher.publish).toHaveBeenCalled();
  });

  it('should give the code use back when the creation fails before the save', async () => {
    const reservation = new NodeRegistrationReservation(
      NodeRegistrationCodeId.generate(),
    );
    const failure = new Error('publish failed before save');
    creationDetector.isCreation.mockResolvedValue(true);
    registrationAdmitter.admit.mockResolvedValue(reservation);
    publisher.publish.mockRejectedValue(failure);

    await expect(put()).rejects.toBe(failure);
    expect(registrationAdmitter.release).toHaveBeenCalledWith(reservation);
  });

  it('should publish an update of an identity this node holds', async () => {
    creationDetector.isCreation.mockResolvedValue(false);
    registrationAdmitter.admit.mockResolvedValue(
      NodeRegistrationReservation.none(),
    );

    await put();

    expect(publisher.publish).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
