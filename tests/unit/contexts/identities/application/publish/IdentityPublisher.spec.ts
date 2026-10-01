import DeviceAuthorizationProvisioner from '@app/contexts/identity-devices/application/provision/DeviceAuthorizationProvisioner';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentityCandidateValidationDomainService from '@app/contexts/identities/domain/services/IdentityCandidateValidationDomainService';
import IdentitySaverService from '@app/contexts/identities/domain/services/IdentitySaverService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('IdentityPublisher', () => {
  let saver: MockProxy<IdentitySaverService>;
  let repository: MockProxy<IdentityRepository>;
  let validator: MockProxy<IdentityCandidateValidationDomainService>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let provisioner: MockProxy<DeviceAuthorizationProvisioner>;
  let publisher: IdentityPublisher;

  beforeEach(() => {
    saver = mock<IdentitySaverService>();
    repository = mock<IdentityRepository>();
    validator = mock<IdentityCandidateValidationDomainService>();
    eventPublisher = mock<DomainEventPublisher>();
    provisioner = mock<DeviceAuthorizationProvisioner>();
    publisher = new IdentityPublisher(
      saver,
      repository,
      validator,
      eventPublisher,
      provisioner,
    );
    validator.isValidChainFor.mockResolvedValue(true);
    const externalIdentifier = new IdentityExternalIdentifier('bafkidentity');
    saver.calculateExternalIdentifier.mockResolvedValue(externalIdentifier);
    saver.save.mockResolvedValue(externalIdentifier);
  });

  it('does not publish an identity when device authorization provisioning fails', async () => {
    const identity = new IdentityMother().build();
    provisioner.provision.mockRejectedValue(new Error('provisioning failed'));

    await expect(
      publisher.publish(new IdentityPublishMessage(identity.toPrimitives())),
    ).rejects.toThrow('provisioning failed');
    expect(saver.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('provisions authorization before publishing the prepared identity', async () => {
    const identity = new IdentityMother().build();

    await publisher.publish(
      new IdentityPublishMessage(identity.toPrimitives()),
    );

    const preparationCall =
      saver.calculateExternalIdentifier.mock.invocationCallOrder[0];
    const provisionCall = provisioner.provision.mock.invocationCallOrder[0];
    const saveCall = saver.save.mock.invocationCallOrder[0];
    const eventCall = eventPublisher.publish.mock.invocationCallOrder[0];

    expect(preparationCall).toBeLessThan(provisionCall);
    expect(provisionCall).toBeLessThan(saveCall);
    expect(saveCall).toBeLessThan(eventCall);
  });

  it('withdraws the provisional authorization when saving the identity fails', async () => {
    const identity = new IdentityMother().build();
    saver.save.mockRejectedValue(new Error('routing publication failed'));

    await expect(
      publisher.publish(new IdentityPublishMessage(identity.toPrimitives())),
    ).rejects.toThrow('routing publication failed');
    expect(provisioner.withdraw).toHaveBeenCalledTimes(1);
    expect(provisioner.withdraw).toHaveBeenCalledWith(
      provisioner.provision.mock.calls[0][0],
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
