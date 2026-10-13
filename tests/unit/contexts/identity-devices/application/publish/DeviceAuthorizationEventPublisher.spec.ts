import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import DeviceAuthorizationEventPublisher from '@app/contexts/identity-devices/application/publish/DeviceAuthorizationEventPublisher';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

describe(DeviceAuthorizationEventPublisher.name, () => {
  async function fixture(): Promise<{
    enrolled: DeviceAuthorization;
    genesis: DeviceAuthorization;
  }> {
    const owner = await KeyPair.generate();
    const identity = await KeyPair.generate();
    const target = await KeyPair.generate();
    const recovery = await KeyPair.generate();
    const genesis = DeviceAuthorization.genesis(
      new IdentityId(identity.toPrimitives().publicKey),
      [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
    );
    const enrolled = genesis.enroll(
      DeviceCredential.fromString(target.toPrimitives().publicKey),
    );

    return { enrolled, genesis };
  }

  it('publishes the events recorded by the applied state through the local bus', async () => {
    const localPublisher = mock<LocalDomainEventPublisher>();
    const { enrolled } = await fixture();

    await new DeviceAuthorizationEventPublisher(localPublisher).publish(
      enrolled,
    );

    expect(localPublisher.publishLocally).toHaveBeenCalledTimes(1);
    const [events] = localPublisher.publishLocally.mock.calls[0];

    expect(events.map((event) => event.eventName())).toEqual([
      'identity_devices.v1.device_authorization.credential_enrolled',
    ]);
  });

  it('drains the aggregate so the same events are not published twice', async () => {
    const localPublisher = mock<LocalDomainEventPublisher>();
    const publisher = new DeviceAuthorizationEventPublisher(localPublisher);
    const { enrolled } = await fixture();

    await publisher.publish(enrolled);
    await publisher.publish(enrolled);

    expect(localPublisher.publishLocally).toHaveBeenCalledTimes(1);
    expect(enrolled.pullDomainEvents()).toEqual([]);
  });

  it('publishes nothing for state without recorded events', async () => {
    const localPublisher = mock<LocalDomainEventPublisher>();
    const { genesis } = await fixture();

    await new DeviceAuthorizationEventPublisher(localPublisher).publish(
      genesis,
    );

    expect(localPublisher.publishLocally).not.toHaveBeenCalled();
  });
});
