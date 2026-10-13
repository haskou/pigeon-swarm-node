import IdentityAdmissionObserver from '@app/contexts/identities/application/observe-admission/IdentityAdmissionObserver';
import { IdentityAdmissionObservationMessage } from '@app/contexts/identities/application/observe-admission/messages/IdentityAdmissionObservationMessage';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityAdmissionLoadRepository from '@app/contexts/identities/domain/repositories/IdentityAdmissionLoadRepository';
import IdentityAdmissionPricingDomainService from '@app/contexts/identities/domain/services/IdentityAdmissionPricingDomainService';
import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

const NETWORK = '550e8400-e29b-41d4-a716-446655440000';
const ADDED_NETWORK = '550e8400-e29b-41d4-a716-446655440001';
const FREE = IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW;
const HORIZON = IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;
const OBSERVED = 'bafkobserved';
const HOSTED = [NETWORK, ADDED_NETWORK];

function observation(
  identity: Identity,
  hostedNetworks: string[] = HOSTED,
  previous?: Identity,
): IdentityAdmissionObservationMessage {
  return new IdentityAdmissionObservationMessage(
    identity,
    OBSERVED,
    hostedNetworks,
    previous,
  );
}

function identityIdOf(identity: Identity): IdentityId {
  return new IdentityId(identity.toPrimitives().id);
}

describe(IdentityAdmissionObserver.name, () => {
  let load: MockProxy<IdentityAdmissionLoadRepository>;
  let observer: IdentityAdmissionObserver;
  let signedAt: number;

  /** Nonce that meets exactly `bits` leading zero bits and not one more. */
  function nonceWithExactly(
    mother: IdentityMother,
    networks: string[],
    bits: number,
  ): string {
    const proof = new IdentityAdmissionProof(mother.id.valueOf(), networks);

    return proof.mine(
      (nonce) => proof.isValid(nonce, bits) && !proof.isValid(nonce, bits + 1),
    );
  }

  function genesisProvenAt(
    bits: number,
    timestamp: number = signedAt,
  ): Promise<Identity> {
    const mother = new IdentityMother();

    return mother.buildNext({
      admissionNonce: nonceWithExactly(mother, [NETWORK], bits),
      previousIdentityExternalIdentifier: undefined,
      timestamp,
      version: 1,
    });
  }

  function loadPerNetwork(counts: Record<string, number>): void {
    load.countRecent.mockImplementation(
      async (networkId: NetworkId) => counts[networkId.valueOf()] ?? 0,
    );
  }

  beforeEach(() => {
    signedAt = new IdentityMother().timestamp.valueOf() + 1;
    jest.spyOn(Date, 'now').mockReturnValue(signedAt);
    load = mock<IdentityAdmissionLoadRepository>();
    observer = new IdentityAdmissionObserver(
      new IdentityAdmissionPricingDomainService(load),
    );
    loadPerNetwork({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts a fresh genesis that pays what this node asks', async () => {
    const identity = await genesisProvenAt(16);

    await observer.observe(observation(identity));

    expect(load.record).toHaveBeenCalledWith(identityIdOf(identity), [
      new NetworkId(NETWORK),
    ]);
  });

  it('ignores admissions signed outside the freshness horizon', async () => {
    for (const timestamp of [signedAt - HORIZON - 1, signedAt + HORIZON + 1]) {
      const identity = await genesisProvenAt(16, timestamp);

      await observer.observe(observation(identity));
    }

    expect(load.countRecent).not.toHaveBeenCalled();
    expect(load.record).not.toHaveBeenCalled();
  });

  it('ignores admissions whose proof misses what this node asks', async () => {
    const identity = await genesisProvenAt(16);
    loadPerNetwork({ [NETWORK]: FREE });

    await observer.observe(observation(identity));

    expect(load.record).not.toHaveBeenCalled();
  });

  it('counts admissions whose proof meets the raised price', async () => {
    const identity = await genesisProvenAt(17);
    loadPerNetwork({ [NETWORK]: FREE });

    await observer.observe(observation(identity));

    expect(load.record).toHaveBeenCalledTimes(1);
  });

  it('counts only the networks an update adds to its known previous version', async () => {
    const mother = new IdentityMother();
    const previous = mother.build();
    const update = await mother.buildNext({
      networks: [NETWORK, ADDED_NETWORK],
    });

    await observer.observe(observation(update, HOSTED, previous));

    expect(load.record).toHaveBeenCalledWith(identityIdOf(update), [
      new NetworkId(ADDED_NETWORK),
    ]);
  });

  it('counts nothing for an update that keeps its networks', async () => {
    const mother = new IdentityMother();
    const previous = mother.build();
    const update = await mother.buildNext();

    await observer.observe(observation(update, HOSTED, previous));

    expect(load.record).not.toHaveBeenCalled();
  });

  it('counts every hosted network of an update whose previous version is unknown here', async () => {
    const mother = new IdentityMother();
    const update = await mother.buildNext({
      networks: [NETWORK, ADDED_NETWORK],
    });

    await observer.observe(observation(update));

    expect(load.record).toHaveBeenCalledWith(identityIdOf(update), [
      new NetworkId(NETWORK),
      new NetworkId(ADDED_NETWORK),
    ]);
  });

  it('counts and prices only the networks this node hosts', async () => {
    const mother = new IdentityMother();
    const update = await mother.buildNext({
      networks: [NETWORK, ADDED_NETWORK],
    });
    loadPerNetwork({ [ADDED_NETWORK]: FREE });

    await observer.observe(observation(update, [NETWORK]));

    expect(load.countRecent).not.toHaveBeenCalledWith(
      new NetworkId(ADDED_NETWORK),
    );
    expect(load.record).toHaveBeenCalledWith(identityIdOf(update), [
      new NetworkId(NETWORK),
    ]);
  });

  it('counts nothing for an admission into networks this node does not host', async () => {
    const identity = await genesisProvenAt(16);

    await observer.observe(observation(identity, [ADDED_NETWORK]));

    expect(load.countRecent).not.toHaveBeenCalled();
    expect(load.record).not.toHaveBeenCalled();
  });
});
