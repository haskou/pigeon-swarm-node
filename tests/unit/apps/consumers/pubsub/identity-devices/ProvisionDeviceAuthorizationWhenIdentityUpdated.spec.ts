import ProvisionDeviceAuthorizationWhenIdentityUpdated from '@app/apps/consumers/pubsub/identity-devices/ProvisionDeviceAuthorizationWhenIdentityUpdated';
import DeviceAuthorizationProvisioner from '@app/contexts/identity-devices/application/provision/DeviceAuthorizationProvisioner';
import { DeviceAuthorizationProvisionMessage } from '@app/contexts/identity-devices/application/provision/messages/DeviceAuthorizationProvisionMessage';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe(ProvisionDeviceAuthorizationWhenIdentityUpdated.name, () => {
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let identityRepository: MockProxy<IdentityRepository>;
  let provisioner: MockProxy<DeviceAuthorizationProvisioner>;
  let consumer: ProvisionDeviceAuthorizationWhenIdentityUpdated;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    eventConsumer = mock<DomainEventConsumer>();
    identityRepository = mock<IdentityRepository>();
    provisioner = mock<DeviceAuthorizationProvisioner>();
    consumer = new ProvisionDeviceAuthorizationWhenIdentityUpdated(
      eventConsumer,
      provisioner,
      identityRepository,
    );
  });

  it('subscribes to identity update events', async () => {
    await consumer.init();

    expect(eventConsumer.consume).toHaveBeenCalledWith(
      ProvisionDeviceAuthorizationWhenIdentityUpdated.QUEUE_NAME,
      IdentityWasUpdatedEvent.EVENT_NAME,
      IdentityWasUpdatedEvent,
      'pigeon-swarm',
      expect.any(Function),
    );
  });

  it('refreshes authorization routing from the exact updated candidate', async () => {
    const mother = new IdentityMother();
    const networkIds = [
      ...mother.networks,
      new NetworkId('550e8400-e29b-41d4-a716-446655440001'),
    ];
    const identity = await mother.buildNext({
      networks: networkIds.map((networkId) => networkId.valueOf()),
    });
    const externalIdentifier = new IdentityExternalIdentifier(
      'bafy-updated-identity',
    );
    identityRepository.findCandidateByExternalIdentifier.mockResolvedValue(
      new IdentityCandidate(externalIdentifier, identity),
    );

    await consumer.handler(
      new IdentityWasUpdatedEvent(mother.id.valueOf(), {
        externalIdentifier: externalIdentifier.valueOf(),
      }),
    );

    expect(
      identityRepository.findCandidateByExternalIdentifier,
    ).toHaveBeenCalledWith(mother.id, externalIdentifier);
    const message = provisioner.provision.mock.calls[0][0];

    expect(message).toBeInstanceOf(DeviceAuthorizationProvisionMessage);
    expect(message.identityId.isEqual(mother.id)).toBe(true);
    expect(message.identityVersion.valueOf()).toBe(2);
    expect(message.identityExternalIdentifier.isEqual(externalIdentifier)).toBe(
      true,
    );
    expect(message.networkIds).toEqual(networkIds);
    expect(message.credential.isEqual(mother.deviceCredential)).toBe(true);
    expect(message.recoveryAuthority.isEqual(mother.recoveryAuthority)).toBe(
      true,
    );
  });
});
