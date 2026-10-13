import IdentityAdmissionLoadRepository from '@app/contexts/identities/domain/repositories/IdentityAdmissionLoadRepository';
import IdentityAdmissionPricingDomainService from '@app/contexts/identities/domain/services/IdentityAdmissionPricingDomainService';
import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

const NETWORK = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
const OTHER_NETWORK = new NetworkId('550e8400-e29b-41d4-a716-446655440001');
const FREE = IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW;
const HORIZON = IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;

describe(IdentityAdmissionPricingDomainService.name, () => {
  let load: MockProxy<IdentityAdmissionLoadRepository>;
  let pricing: IdentityAdmissionPricingDomainService;
  let mother: IdentityMother;
  let signedAt: number;

  function loadPerNetwork(counts: Record<string, number>): void {
    load.countRecent.mockImplementation(
      async (networkId: NetworkId) => counts[networkId.valueOf()] ?? 0,
    );
  }

  beforeEach(() => {
    load = mock<IdentityAdmissionLoadRepository>();
    pricing = new IdentityAdmissionPricingDomainService(load);
    mother = new IdentityMother();
    signedAt = mother.timestamp.valueOf();
    loadPerNetwork({});
  });

  it('asks the floor for a fresh admission into quiet networks', async () => {
    const required = await pricing.requiredFor(
      mother.build(),
      [NETWORK],
      new Timestamp(signedAt),
    );

    expect(required.valueOf()).toBe(
      IdentityAdmissionDifficulty.floor().valueOf(),
    );
  });

  it('asks the hardest requirement among the entered networks', async () => {
    loadPerNetwork({
      [NETWORK.valueOf()]: FREE,
      [OTHER_NETWORK.valueOf()]: FREE * 4,
    });

    const required = await pricing.requiredFor(
      mother.build(),
      [NETWORK, OTHER_NETWORK],
      new Timestamp(signedAt + HORIZON),
    );

    expect(required.valueOf()).toBe(19);
  });

  it('asks the cap for an admission signed outside the freshness horizon', async () => {
    for (const now of [signedAt + HORIZON + 1, signedAt - HORIZON - 1]) {
      const required = await pricing.requiredFor(
        mother.build(),
        [NETWORK],
        new Timestamp(now),
      );

      expect(required.valueOf()).toBe(IdentityAdmissionDifficulty.MAX_BITS);
    }
    expect(load.countRecent).not.toHaveBeenCalled();
  });

  it('asks the floor when no network is entered, however old the signature', async () => {
    loadPerNetwork({ [NETWORK.valueOf()]: FREE * 64 });

    const required = await pricing.requiredFor(
      mother.build(),
      [],
      new Timestamp(signedAt + HORIZON * 100),
    );

    expect(required.valueOf()).toBe(
      IdentityAdmissionDifficulty.floor().valueOf(),
    );
    expect(load.countRecent).not.toHaveBeenCalled();
  });

  it('charges the entered networks against the admitted identity', async () => {
    await pricing.charge(mother.id, [NETWORK]);

    expect(load.record).toHaveBeenCalledWith(mother.id, [NETWORK]);
  });

  it('charges nothing when no network is entered', async () => {
    await pricing.charge(mother.id, []);

    expect(load.record).not.toHaveBeenCalled();
  });
});
