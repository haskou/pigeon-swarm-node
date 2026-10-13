import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import DeviceSealedSecretHandover from '@app/contexts/identity-devices/application/hand-over/DeviceSealedSecretHandover';
import { HandOverDeviceSealedSecretsMessage } from '@app/contexts/identity-devices/application/hand-over/messages/HandOverDeviceSealedSecretsMessage';
import DeviceAuthorizationEventPublisher from '@app/contexts/identity-devices/application/publish/DeviceAuthorizationEventPublisher';
import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceSealedSecretGenerationStaleError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretGenerationStaleError';
import { DeviceSealedSecretNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretNotFoundError';
import { DeviceSealedSecretRecipientsMismatchError } from '@app/contexts/identity-devices/domain/errors/DeviceSealedSecretRecipientsMismatchError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  bundleOf,
  EnrolledDeviceFixture,
  enrolledDeviceFixture,
  retirementOf,
  sealedEntry,
} from '../../DeviceSealedSecretFixtures';
import { InMemoryDeviceSealedSecretRepository } from '../../InMemoryDeviceSealedSecretRepository';

describe(DeviceSealedSecretHandover.name, () => {
  let authorizations: MockProxy<DeviceAuthorizationRepository>;
  let eventPublisher: MockProxy<DeviceAuthorizationEventPublisher>;
  let sealedSecrets: InMemoryDeviceSealedSecretRepository;
  let handover: DeviceSealedSecretHandover;

  beforeEach(() => {
    authorizations = mock<DeviceAuthorizationRepository>();
    eventPublisher = mock<DeviceAuthorizationEventPublisher>();
    sealedSecrets = new InMemoryDeviceSealedSecretRepository();
    handover = new DeviceSealedSecretHandover(
      authorizations,
      sealedSecrets,
      eventPublisher,
    );
  });

  function messageFor(
    fixture: EnrolledDeviceFixture,
    recipients: KeyPair[] = [fixture.owner],
    generation = 2,
  ): HandOverDeviceSealedSecretsMessage {
    return new HandOverDeviceSealedSecretsMessage(
      retirementOf({
        author: fixture.candidate,
        identityId: fixture.identityId,
        previousRevision: 1,
        target: fixture.candidate,
      }),
      bundleOf({
        authorizationRevision: 2,
        entries: recipients.map((recipient) =>
          sealedEntry({
            authorizationRevision: 2,
            generation,
            identityId: fixture.identityId,
            publisher: fixture.candidate,
            recipient,
          }),
        ),
        generation,
        identityId: fixture.identityId,
        publisher: fixture.candidate,
      }).toPrimitives(),
    );
  }

  function storedBundle(
    fixture: EnrolledDeviceFixture,
    generation: number,
  ): DeviceSealedSecretBundle {
    return bundleOf({
      authorizationRevision: 1,
      entries: [fixture.owner, fixture.candidate].map((recipient) =>
        sealedEntry({
          authorizationRevision: 1,
          generation,
          identityId: fixture.identityId,
          publisher: fixture.owner,
          recipient,
        }),
      ),
      generation,
      identityId: fixture.identityId,
      publisher: fixture.owner,
    });
  }

  it('applies the retirement and replaces the stored generation with the hand-over', async () => {
    const fixture = await enrolledDeviceFixture();
    const retired = fixture.authorization.revoke(
      DeviceCredential.fromString(fixture.candidate.toPrimitives().publicKey),
    );
    authorizations.require.mockResolvedValue(fixture.authorization);
    authorizations.compareAndApply.mockResolvedValue(retired);
    await sealedSecrets.replaceIfNewer(storedBundle(fixture, 1));

    const result = await handover.handOver(messageFor(fixture));

    expect(result).toEqual({ authorization: retired, handedOver: true });
    expect(eventPublisher.publish).toHaveBeenCalledWith(retired);
    const stored = await sealedSecrets.require(
      new IdentityId(fixture.identityId),
    );
    expect(stored.getGeneration().valueOf()).toBe(2);
    expect(stored.getAuthorizationRevision().valueOf()).toBe(2);
    expect(
      stored.deliveryFor(
        DeviceCredential.fromString(fixture.owner.toPrimitives().publicKey),
      ).publisherCredential,
    ).toBe(
      new IdentityId(fixture.candidate.toPrimitives().publicKey).valueOf(),
    );
    expect(() =>
      stored.deliveryFor(
        DeviceCredential.fromString(fixture.candidate.toPrimitives().publicKey),
      ),
    ).toThrow(DeviceSealedSecretNotFoundError);
  });

  it('rejects a hand-over that does not advance the stored generation before retiring the device', async () => {
    const fixture = await enrolledDeviceFixture();
    authorizations.require.mockResolvedValue(fixture.authorization);
    const stored = storedBundle(fixture, 2);
    await sealedSecrets.replaceIfNewer(stored);

    await expect(handover.handOver(messageFor(fixture))).rejects.toThrow(
      DeviceSealedSecretGenerationStaleError,
    );
    expect(authorizations.compareAndApply).not.toHaveBeenCalled();
    expect(
      (
        await sealedSecrets.require(new IdentityId(fixture.identityId))
      ).toPrimitives(),
    ).toEqual(stored.toPrimitives());
  });

  it('rejects an invalid hand-over before retiring the device', async () => {
    const fixture = await enrolledDeviceFixture();
    authorizations.require.mockResolvedValue(fixture.authorization);

    await expect(
      handover.handOver(
        messageFor(fixture, [fixture.owner, fixture.candidate]),
      ),
    ).rejects.toThrow(DeviceSealedSecretRecipientsMismatchError);
    expect(authorizations.compareAndApply).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
    expect(sealedSecrets.stored.size).toBe(0);
  });

  it('keeps the retirement but stores nothing when a concurrent transition changed the result', async () => {
    const fixture = await enrolledDeviceFixture();
    const merged = fixture.authorization
      .revoke(
        DeviceCredential.fromString(fixture.candidate.toPrimitives().publicKey),
      )
      .enroll(
        DeviceCredential.fromString(
          (await KeyPair.generate()).toPrimitives().publicKey,
        ),
      );
    authorizations.require.mockResolvedValue(fixture.authorization);
    authorizations.compareAndApply.mockResolvedValue(merged);

    const result = await handover.handOver(messageFor(fixture));

    expect(result).toEqual({ authorization: merged, handedOver: false });
    expect(eventPublisher.publish).toHaveBeenCalledWith(merged);
    expect(sealedSecrets.stored.size).toBe(0);
  });
});
