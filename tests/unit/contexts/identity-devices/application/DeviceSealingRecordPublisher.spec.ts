import { PublishDeviceSealingRecordMessage } from '@app/contexts/identity-devices/application/publish/messages/PublishDeviceSealingRecordMessage';
import DeviceSealingRecordPublisher from '@app/contexts/identity-devices/application/publish/DeviceSealingRecordPublisher';
import { DeviceSealingRecordRejectedError } from '@app/contexts/identity-devices/domain/errors/DeviceSealingRecordRejectedError';
import { DeviceSealingRecordRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceSealingRecordRepository';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { mock, MockProxy } from 'jest-mock-extended';

import { singleDeviceFixture } from '../DeviceSealedSecretFixtures';
import { signedRecordPrimitives, TODAY } from '../DeviceSealingRecordFixtures';

describe(DeviceSealingRecordPublisher.name, () => {
  let repository: MockProxy<DeviceSealingRecordRepository>;
  let publisher: DeviceSealingRecordPublisher;
  let owner: KeyPair;
  let identityId: string;

  const messageOf = (
    overrides: Partial<Record<'utcDay' | 'sealingPublicKey' | 'signature', string>> = {},
  ): PublishDeviceSealingRecordMessage => {
    const { record, signature } = signedRecordPrimitives({ identityId, signer: owner });

    return new PublishDeviceSealingRecordMessage(
      record.identityId,
      record.deviceCredential,
      overrides.utcDay ?? TODAY,
      overrides.sealingPublicKey ?? record.sealingPublicKey,
      overrides.signature ?? signature,
    );
  };

  beforeEach(async () => {
    ({ identityId, owner } = await singleDeviceFixture());
    repository = mock<DeviceSealingRecordRepository>();
    publisher = new DeviceSealingRecordPublisher(repository);
  });

  it.each([true, false])('reports whether the record was newly stored (%s)', async (created) => {
    repository.publish.mockResolvedValue(created);

    await expect(publisher.publish(messageOf())).resolves.toBe(created);
  });

  it('hands the repository the signed record exactly as sent', async () => {
    repository.publish.mockResolvedValue(true);
    const { record, signature } = signedRecordPrimitives({ identityId, signer: owner });

    await publisher.publish(messageOf());

    expect(repository.publish.mock.calls[0][0].toPrimitives()).toEqual({ record, signature });
  });

  it.each([
    ['a malformed day', { utcDay: '2026-5-2' }],
    ['a malformed signature', { signature: 'not-a-signature' }],
    ['an oversize sealing key', { sealingPublicKey: 'A'.repeat(4096) }],
    ['a short sealing key', { sealingPublicKey: 'AAAA' }],
  ])('rejects %s without touching the repository', async (_name, overrides) => {
    await expect(publisher.publish(messageOf(overrides))).rejects.toThrow(
      DeviceSealingRecordRejectedError,
    );
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('propagates the repository refusal', async () => {
    repository.publish.mockRejectedValue(new DeviceSealingRecordRejectedError());

    await expect(publisher.publish(messageOf())).rejects.toThrow(
      DeviceSealingRecordRejectedError,
    );
  });
});
