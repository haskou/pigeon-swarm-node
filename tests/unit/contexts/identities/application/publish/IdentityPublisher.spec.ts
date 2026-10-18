import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { IdentityPublishMessage } from '@app/contexts/identities/application/publish/messages/IdentityPublishMessage';
import { InsufficientIdentityAdmissionProofError } from '@app/contexts/identities/domain/errors/InsufficientIdentityAdmissionProofError';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityAdmissionLoadRepository from '@app/contexts/identities/domain/repositories/IdentityAdmissionLoadRepository';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentityAdmissionPricingDomainService from '@app/contexts/identities/domain/services/IdentityAdmissionPricingDomainService';
import IdentityCandidateValidationDomainService from '@app/contexts/identities/domain/services/IdentityCandidateValidationDomainService';
import IdentitySaverService from '@app/contexts/identities/domain/services/IdentitySaverService';
import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import DeviceAuthorizationProvisioner from '@app/contexts/identity-devices/application/provision/DeviceAuthorizationProvisioner';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

const NETWORK = '550e8400-e29b-41d4-a716-446655440000';
const ADDED_NETWORK = '550e8400-e29b-41d4-a716-446655440001';
const BUSY = IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW;
const HORIZON = IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;
const PUBLISHED = new IdentityExternalIdentifier('bafkidentity');

describe('IdentityPublisher', () => {
  let saver: MockProxy<IdentitySaverService>;
  let repository: MockProxy<IdentityRepository>;
  let validator: MockProxy<IdentityCandidateValidationDomainService>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let provisioner: MockProxy<DeviceAuthorizationProvisioner>;
  let admissionLoad: MockProxy<IdentityAdmissionLoadRepository>;
  let publisher: IdentityPublisher;

  /** Nonce that meets exactly `bits` leading zero bits and not one more. */
  function nonceWithExactly(
    mother: IdentityMother,
    networks: string[],
    bits: number,
  ): string {
    const proof = new IdentityAdmissionProof(mother.id.valueOf(), networks);

    return proof.mine(
      (nonce) => proof.isValid(nonce, bits) && !proof.isValid(nonce, bits + 1),
      bits,
    );
  }

  async function genesisProvenAt(bits: number): Promise<Identity> {
    const mother = new IdentityMother();

    return mother.buildNext({
      admissionNonce: nonceWithExactly(mother, [NETWORK], bits),
      previousIdentityExternalIdentifier: undefined,
      version: 1,
    });
  }

  function loadPerNetwork(load: Record<string, number>): void {
    admissionLoad.countRecent.mockImplementation(
      async (networkId: NetworkId) => load[networkId.valueOf()] ?? 0,
    );
  }

  beforeEach(() => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new IdentityMother().timestamp.valueOf());
    saver = mock<IdentitySaverService>();
    repository = mock<IdentityRepository>();
    validator = mock<IdentityCandidateValidationDomainService>();
    eventPublisher = mock<DomainEventPublisher>();
    provisioner = mock<DeviceAuthorizationProvisioner>();
    admissionLoad = mock<IdentityAdmissionLoadRepository>();
    publisher = new IdentityPublisher(
      saver,
      repository,
      validator,
      eventPublisher,
      provisioner,
      new IdentityAdmissionPricingDomainService(admissionLoad),
    );
    validator.isValidChainFor.mockResolvedValue(true);
    saver.calculateExternalIdentifier.mockResolvedValue(PUBLISHED);
    saver.save.mockResolvedValue(PUBLISHED);
    loadPerNetwork({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('resolves previous identities through has/require when validating the chain', async () => {
    const identity = new IdentityMother().build();
    const previous = new IdentityExternalIdentifier('bafkprevious');
    const missing = new IdentityExternalIdentifier('bafkmissing');
    repository.hasByExternalIdentifier.mockImplementation(
      async (externalIdentifier) =>
        externalIdentifier.valueOf() === previous.valueOf(),
    );
    repository.requireByExternalIdentifier.mockResolvedValue(identity);
    const lookups: Array<Promise<unknown>> = [];
    validator.isValidChainFor.mockImplementation(
      async (_identityId, _identity, lookup) => {
        lookups.push(lookup(previous), lookup(missing));

        return true;
      },
    );

    await publisher.publish(
      new IdentityPublishMessage(identity.toPrimitives()),
    );

    await expect(Promise.all(lookups)).resolves.toEqual([identity, undefined]);
    expect(repository.requireByExternalIdentifier).toHaveBeenCalledTimes(1);
    expect(repository.requireByExternalIdentifier).toHaveBeenCalledWith(
      previous,
    );
  });

  describe('admission difficulty', () => {
    it('asks only the protocol floor while the network is quiet on this node', async () => {
      const identity = await genesisProvenAt(16);
      loadPerNetwork({ [NETWORK]: BUSY - 1 });

      await publisher.publish(
        new IdentityPublishMessage(identity.toPrimitives()),
      );

      expect(saver.save).toHaveBeenCalledTimes(1);
    });

    it('refuses a new admission whose proof misses the raised difficulty', async () => {
      const identity = await genesisProvenAt(16);
      loadPerNetwork({ [NETWORK]: BUSY });

      const publication = publisher.publish(
        new IdentityPublishMessage(identity.toPrimitives()),
      );

      await expect(publication).rejects.toBeInstanceOf(
        InsufficientIdentityAdmissionProofError,
      );
      await expect(publication).rejects.toMatchObject({
        requiredDifficultyBits: 17,
      });
      expect(provisioner.provision).not.toHaveBeenCalled();
      expect(saver.save).not.toHaveBeenCalled();
      expect(admissionLoad.record).not.toHaveBeenCalled();
    });

    it('admits a proof that meets the raised difficulty', async () => {
      const identity = await genesisProvenAt(17);
      loadPerNetwork({ [NETWORK]: BUSY });

      await publisher.publish(
        new IdentityPublishMessage(identity.toPrimitives()),
      );

      expect(saver.save).toHaveBeenCalledTimes(1);
    });

    it('charges the admitted networks only after the identity is saved', async () => {
      const identity = await genesisProvenAt(16);

      await publisher.publish(
        new IdentityPublishMessage(identity.toPrimitives()),
      );

      expect(admissionLoad.record).toHaveBeenCalledWith(
        new IdentityId(identity.toPrimitives().id),
        [new NetworkId(NETWORK)],
      );
      expect(admissionLoad.record.mock.invocationCallOrder[0]).toBeGreaterThan(
        saver.save.mock.invocationCallOrder[0],
      );
    });

    it('does not charge an admission that fails to save', async () => {
      const identity = await genesisProvenAt(16);
      saver.save.mockRejectedValue(new Error('routing publication failed'));

      await expect(
        publisher.publish(new IdentityPublishMessage(identity.toPrimitives())),
      ).rejects.toThrow('routing publication failed');
      expect(admissionLoad.record).not.toHaveBeenCalled();
    });

    it('does not raise the bar for an update that keeps its networks', async () => {
      const mother = new IdentityMother();
      const previous = mother.build();
      const update = await mother.buildNext();
      repository.requireByExternalIdentifier.mockResolvedValue(previous);
      loadPerNetwork({ [NETWORK]: BUSY * 64 });

      await publisher.publish(
        new IdentityPublishMessage(update.toPrimitives()),
      );

      expect(saver.save).toHaveBeenCalledTimes(1);
      expect(admissionLoad.countRecent).not.toHaveBeenCalled();
      expect(admissionLoad.record).not.toHaveBeenCalled();
    });

    it('prices an update by the networks it adds', async () => {
      const mother = new IdentityMother();
      const previous = mother.build();
      const networks = [NETWORK, ADDED_NETWORK];
      const update = await mother.buildNext({
        admissionNonce: nonceWithExactly(mother, networks, 16),
        networks,
      });
      repository.requireByExternalIdentifier.mockResolvedValue(previous);
      loadPerNetwork({ [ADDED_NETWORK]: BUSY * 2 });

      await expect(
        publisher.publish(new IdentityPublishMessage(update.toPrimitives())),
      ).rejects.toMatchObject({ requiredDifficultyBits: 18 });
      expect(admissionLoad.countRecent).toHaveBeenCalledTimes(1);
      expect(admissionLoad.countRecent).toHaveBeenCalledWith(
        new NetworkId(ADDED_NETWORK),
      );
    });

    it('charges an update only for the networks it adds', async () => {
      const mother = new IdentityMother();
      const previous = mother.build();
      const update = await mother.buildNext({
        networks: [NETWORK, ADDED_NETWORK],
      });
      repository.requireByExternalIdentifier.mockResolvedValue(previous);

      await publisher.publish(
        new IdentityPublishMessage(update.toPrimitives()),
      );

      expect(admissionLoad.record).toHaveBeenCalledWith(mother.id, [
        new NetworkId(ADDED_NETWORK),
      ]);
    });

    it('prices a backdated admission at the cap so it cannot dodge observation', async () => {
      const mother = new IdentityMother();
      const identity = await mother.buildNext({
        admissionNonce: nonceWithExactly(mother, [NETWORK], 16),
        previousIdentityExternalIdentifier: undefined,
        timestamp: Date.now() - HORIZON - 1,
        version: 1,
      });

      await expect(
        publisher.publish(new IdentityPublishMessage(identity.toPrimitives())),
      ).rejects.toMatchObject({
        requiredDifficultyBits: IdentityAdmissionDifficulty.MAX_BITS,
      });
      expect(admissionLoad.countRecent).not.toHaveBeenCalled();
      expect(saver.save).not.toHaveBeenCalled();
    });

    it('prices a future-dated admission at the cap', async () => {
      const mother = new IdentityMother();
      const identity = await mother.buildNext({
        admissionNonce: nonceWithExactly(mother, [NETWORK], 16),
        previousIdentityExternalIdentifier: undefined,
        timestamp: Date.now() + HORIZON + 1,
        version: 1,
      });

      await expect(
        publisher.publish(new IdentityPublishMessage(identity.toPrimitives())),
      ).rejects.toMatchObject({
        requiredDifficultyBits: IdentityAdmissionDifficulty.MAX_BITS,
      });
    });

    it('keeps the floor for a backdated update that enters no network', async () => {
      const mother = new IdentityMother();
      const previous = mother.build();
      const update = await mother.buildNext({
        timestamp: Date.now() - HORIZON - 1,
      });
      repository.requireByExternalIdentifier.mockResolvedValue(previous);

      await publisher.publish(
        new IdentityPublishMessage(update.toPrimitives()),
      );

      expect(saver.save).toHaveBeenCalledTimes(1);
      expect(admissionLoad.record).not.toHaveBeenCalled();
    });
  });
});
