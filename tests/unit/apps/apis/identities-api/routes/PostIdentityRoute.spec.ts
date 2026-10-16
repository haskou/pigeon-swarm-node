import { PostIdentityBody } from '@app/apps/apis/identities-api/bodies/PostIdentityBody';
import IdentityAdmissionSourceRateLimiter from '@app/apps/apis/identities-api/IdentityAdmissionSourceRateLimiter';
import IdentityCreationQueue from '@app/apps/apis/identities-api/IdentityCreationQueue';
import IdentityNetworkAdmissionRateLimiter from '@app/apps/apis/identities-api/IdentityNetworkAdmissionRateLimiter';
import IdentityPublishRateLimiter from '@app/apps/apis/identities-api/IdentityPublishRateLimiter';
import { PostIdentityRoute } from '@app/apps/apis/identities-api/routes/PostIdentityRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { Kernel } from '@haskou/ddd-kernel';
import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';

const IDENTITY_ID =
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=';

describe('PostIdentityRoute', () => {
  let creationDetector: MockProxy<IdentityCreationDetector>;
  let publisher: MockProxy<IdentityPublisher>;
  let registrationAdmitter: MockProxy<NodeRegistrationAdmitter>;
  let reservation: NodeRegistrationReservation;

  const publish = async (): Promise<unknown> => {
    const route = new PostIdentityRoute();
    const message = { identity: {} } as unknown as IdentityPublishMessage;
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
    registrationAdmitter = mock<NodeRegistrationAdmitter>();
    reservation = new NodeRegistrationReservation(
      NodeRegistrationCodeId.generate(),
    );
    registrationAdmitter.admit.mockResolvedValue(reservation);

    const services = new Map<unknown, unknown>([
      [IdentityAdmissionSourceRateLimiter, mock()],
      [IdentityCreationDetector, creationDetector],
      [IdentityCreationQueue, new IdentityCreationQueue()],
      [IdentityNetworkAdmissionRateLimiter, mock()],
      [IdentityPublishRateLimiter, mock()],
      [IdentityPublisher, publisher],
      [NodeRegistrationAdmitter, registrationAdmitter],
      [SignedHttpRequestAuthenticator, mock()],
    ]);
    new Kernel({
      di: { getService: (service: unknown) => services.get(service) } as never,
    });
  });

  it('should keep the code use spent when the identity was saved before the failure', async () => {
    const failure = new Error('event publish failed after save');
    creationDetector.isCreation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    publisher.publish.mockRejectedValue(failure);

    expect(await publish()).toBe(failure);
    expect(registrationAdmitter.release).not.toHaveBeenCalled();
  });

  it('should give the code use back when the identity was not saved', async () => {
    const failure = new Error('publish failed before save');
    creationDetector.isCreation.mockResolvedValue(true);
    publisher.publish.mockRejectedValue(failure);

    expect(await publish()).toBe(failure);
    expect(registrationAdmitter.release).toHaveBeenCalledWith(reservation);
  });
});
