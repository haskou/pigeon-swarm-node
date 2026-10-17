import { IdentityCreationIsRefusedOnThisNodeError } from '@app/apps/apis/identities-api/errors/IdentityCreationIsRefusedOnThisNodeError';
import IdentityCreationGate from '@app/apps/apis/identities-api/IdentityCreationGate';
import IdentityCreationDetector from '@app/contexts/identities/application/detect-creation/IdentityCreationDetector';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { NodeRegistrationAdmitterMessage } from '@app/contexts/nodes/application/admit-registration/messages/NodeRegistrationAdmitterMessage';
import NodeRegistrationAdmitter from '@app/contexts/nodes/application/admit-registration/NodeRegistrationAdmitter';
import { NodeRegistrationReservation } from '@app/contexts/nodes/application/admit-registration/NodeRegistrationReservation';
import { NodeRegistrationCodeIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { mock, MockProxy } from 'jest-mock-extended';
import { setImmediate } from 'timers/promises';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';

const REGISTRATION_CODE = 'code';

describe('IdentityCreationGate', () => {
  let creationDetector: MockProxy<IdentityCreationDetector>;
  let registrationAdmitter: MockProxy<NodeRegistrationAdmitter>;
  let reservation: NodeRegistrationReservation;
  let identity: MockProxy<Identity>;
  let gate: IdentityCreationGate;

  const publishFailingWith = async (failure: Error): Promise<unknown> => {
    try {
      return await gate.publish(identity, REGISTRATION_CODE, () =>
        Promise.reject(failure),
      );
    } catch (error: unknown) {
      return error;
    }
  };

  beforeEach(() => {
    creationDetector = mock<IdentityCreationDetector>();
    registrationAdmitter = mock<NodeRegistrationAdmitter>();
    reservation = new NodeRegistrationReservation(
      NodeRegistrationCodeId.generate(),
    );
    registrationAdmitter.admit.mockResolvedValue(reservation);
    identity = mock<Identity>();
    identity.getId.mockReturnValue(IdentityIdMother.canonical());
    gate = new IdentityCreationGate(creationDetector, registrationAdmitter);
  });

  it('should refuse a creation the node does not admit before publishing it', async () => {
    const publish = jest.fn();
    creationDetector.isCreation.mockResolvedValue(true);
    registrationAdmitter.admit.mockRejectedValue(
      new NodeRegistrationCodeIsNotValidError(),
    );

    await expect(
      gate.publish(identity, REGISTRATION_CODE, publish),
    ).rejects.toThrow(IdentityCreationIsRefusedOnThisNodeError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('should keep the code use spent when the identity was saved before the failure', async () => {
    const failure = new Error('event publish failed after save');
    creationDetector.isCreation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    expect(await publishFailingWith(failure)).toBe(failure);
    expect(registrationAdmitter.release).not.toHaveBeenCalled();
  });

  it('should give the code use back when the identity was not saved', async () => {
    const failure = new Error('publish failed before save');
    creationDetector.isCreation.mockResolvedValue(true);

    expect(await publishFailingWith(failure)).toBe(failure);
    expect(registrationAdmitter.release).toHaveBeenCalledWith(reservation);
  });

  it('should report the original failure and keep the use spent when the re-check fails', async () => {
    const failure = new Error('event publish failed after save');
    creationDetector.isCreation
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('store unavailable'));

    expect(await publishFailingWith(failure)).toBe(failure);
    expect(registrationAdmitter.release).not.toHaveBeenCalled();
  });

  it('should admit a second publication of one identity only after the first finished', async () => {
    const { promise: firstPublish, resolve: finishFirstPublish } =
      Promise.withResolvers<string>();
    creationDetector.isCreation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const first = gate.publish(identity, REGISTRATION_CODE, () => firstPublish);
    const second = gate.publish(identity, REGISTRATION_CODE, () =>
      Promise.resolve('second'),
    );
    await setImmediate();

    expect(registrationAdmitter.admit).toHaveBeenCalledTimes(1);

    finishFirstPublish('first');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'first',
      'second',
    ]);
    expect(registrationAdmitter.admit).toHaveBeenLastCalledWith(
      new NodeRegistrationAdmitterMessage(false, REGISTRATION_CODE),
    );
  });
});
