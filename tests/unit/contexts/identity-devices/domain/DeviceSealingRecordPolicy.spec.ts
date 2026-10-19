import DeviceSealingRecordPolicy from '@app/contexts/identity-devices/domain/services/DeviceSealingRecordPolicy';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import {
  credentialOf,
  singleDeviceFixture,
  SingleDeviceFixture,
} from '../DeviceSealedSecretFixtures';
import {
  NOW,
  sealingRecordOf,
  TODAY,
  YESTERDAY,
} from '../DeviceSealingRecordFixtures';

describe('DeviceSealingRecordPolicy', () => {
  const policy = new DeviceSealingRecordPolicy();
  let fixture: SingleDeviceFixture;
  let stranger: KeyPair;

  beforeAll(async () => {
    fixture = await singleDeviceFixture();
    stranger = await KeyPair.generate();
  });

  it('admits a record for today signed by an authorised device', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: TODAY,
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(true);
  });

  it('admits a record for yesterday signed by an authorised device', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: YESTERDAY,
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(true);
  });

  it('refuses a record from the day before yesterday', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: '2026-04-30',
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(false);
  });

  it('refuses a record dated tomorrow', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: '2026-05-03',
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(false);
  });

  it('counts UTC calendar days across a month boundary', () => {
    const justAfterMidnight = new Date('2026-03-01T00:30:00.000Z');

    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: '2026-02-28',
        }),
        fixture.authorization,
        justAfterMidnight,
      ),
    ).toBe(true);
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
          utcDay: '2026-02-27',
        }),
        fixture.authorization,
        justAfterMidnight,
      ),
    ).toBe(false);
  });

  it('refuses a record when the identity has no device authorization', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: fixture.owner,
        }),
        undefined,
        NOW,
      ),
    ).toBe(false);
  });

  it('refuses a credential that is not among the identity authorisations', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: fixture.identityId,
          signer: stranger,
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(false);
  });

  it('refuses a record that names another identity than the authorisation', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          identityId: credentialOf(stranger),
          signer: fixture.owner,
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(false);
  });

  it('refuses a record whose signature does not verify under its device credential', () => {
    expect(
      policy.admits(
        sealingRecordOf({
          deviceCredential: credentialOf(fixture.owner),
          identityId: fixture.identityId,
          signer: stranger,
        }),
        fixture.authorization,
        NOW,
      ),
    ).toBe(false);
  });
});
