import { PostIdentityBody } from '@app/apps/apis/identities-api/bodies/PostIdentityBody';
import IdentityAdmissionSourceRateLimiter from '@app/apps/apis/identities-api/IdentityAdmissionSourceRateLimiter';
import IdentityCreationGate from '@app/apps/apis/identities-api/IdentityCreationGate';
import IdentityNetworkAdmissionRateLimiter from '@app/apps/apis/identities-api/IdentityNetworkAdmissionRateLimiter';
import IdentityPublishRateLimiter from '@app/apps/apis/identities-api/IdentityPublishRateLimiter';
import { PostIdentityRoute } from '@app/apps/apis/identities-api/routes/PostIdentityRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Kernel } from '@haskou/ddd-kernel';
import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

const IDENTITY_ID =
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';

describe('PostIdentityRoute', () => {
  let creationDetector: MockProxy<IdentityCreationDetector>;
  let publisher: MockProxy<IdentityPublisher>;
  let publishRateLimiter: MockProxy<IdentityPublishRateLimiter>;
  let registrationAdmitter: MockProxy<NodeRegistrationAdmitter>;
  let reservation: NodeRegistrationReservation;

  const publish = async (): Promise<unknown> => {
    const route = new PostIdentityRoute();
    const identity = mock<Identity>();
    identity.getId.mockReturnValue(new IdentityId(IDENTITY_ID));
    const message = { identity } as unknown as IdentityPublishMessage;
    const body = Object.assign(new PostIdentityBody(), {
      id: IDENTITY_ID,
      networks: [],
    });
    const httpRequest = mock<Request>();
    httpRequest.header.mockReturnValue('code' as never);

    try {
      // The admission and publish step, after the signed record was verified.
      return await route['admitAndPublish'](
        message,
        body,
        httpRequest,
        mock<Response>(),
      );
    } catch (error: unknown) {
      return error;
    }
  };

  beforeEach(() => {
    creationDetector = mock<IdentityCreationDetector>();
    publisher = mock<IdentityPublisher>();
    publishRateLimiter = mock<IdentityPublishRateLimiter>();
    registrationAdmitter = mock<NodeRegistrationAdmitter>();
    reservation = new NodeRegistrationReservation(
      NodeRegistrationCodeId.generate(),
    );
    registrationAdmitter.admit.mockResolvedValue(reservation);

    const services = new Map<unknown, unknown>([
      [IdentityAdmissionSourceRateLimiter, mock()],
      [IdentityCreationDetector, creationDetector],
      [
        IdentityCreationGate,
        new IdentityCreationGate(creationDetector, registrationAdmitter),
      ],
      [IdentityNetworkAdmissionRateLimiter, mock()],
      [IdentityPublishRateLimiter, publishRateLimiter],
      [IdentityPublisher, publisher],
      [SignedHttpRequestAuthenticator, mock()],
    ]);
    new Kernel({
      di: { getService: (service: unknown) => services.get(service) } as never,
    });
  });

  it('should give the code use back when the publish rate limit refuses the creation', async () => {
    const failure = new Error('publish rate limit exceeded');
    creationDetector.isCreation.mockResolvedValue(true);
    publishRateLimiter.consume.mockRejectedValue(failure);

    expect(await publish()).toBe(failure);
    expect(registrationAdmitter.release).toHaveBeenCalledWith(reservation);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
