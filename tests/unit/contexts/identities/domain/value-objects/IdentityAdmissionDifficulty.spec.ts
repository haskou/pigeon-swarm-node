import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';

const FREE = IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW;

describe('IdentityAdmissionDifficulty', () => {
  it('is the protocol floor at its minimum', () => {
    expect(IdentityAdmissionDifficulty.floor().valueOf()).toBe(
      IdentityAdmissionProof.DIFFICULTY_BITS,
    );
  });

  it('keeps the floor while a network is quiet on this node', () => {
    expect(IdentityAdmissionDifficulty.forRecentAdmissions(0).valueOf()).toBe(
      16,
    );
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(FREE - 1).valueOf(),
    ).toBe(16);
  });

  it('adds one bit per doubling of recent admissions beyond the free allowance', () => {
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(FREE).valueOf(),
    ).toBe(17);
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(FREE * 2 - 1).valueOf(),
    ).toBe(17);
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(FREE * 2).valueOf(),
    ).toBe(18);
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(FREE * 4).valueOf(),
    ).toBe(19);
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(FREE * 8).valueOf(),
    ).toBe(20);
  });

  it('caps the requirement so honest users can still register during a flood', () => {
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(1_000_000).valueOf(),
    ).toBe(IdentityAdmissionDifficulty.MAX_BITS);
    expect(IdentityAdmissionDifficulty.MAX_BITS).toBe(20);
  });

  it('exposes the cap as a requirement', () => {
    expect(IdentityAdmissionDifficulty.max().valueOf()).toBe(
      IdentityAdmissionDifficulty.MAX_BITS,
    );
  });

  it('saturates at the first load that asks the cap', () => {
    const saturating =
      IdentityAdmissionDifficulty.SATURATING_ADMISSIONS_PER_WINDOW;

    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(saturating).valueOf(),
    ).toBe(IdentityAdmissionDifficulty.MAX_BITS);
    expect(
      IdentityAdmissionDifficulty.forRecentAdmissions(saturating - 1).valueOf(),
    ).toBeLessThan(IdentityAdmissionDifficulty.MAX_BITS);
  });

  it('never decreases as load grows', () => {
    let previous = IdentityAdmissionDifficulty.floor();

    for (let recent = 0; recent <= FREE * 16; recent += 1) {
      const difficulty =
        IdentityAdmissionDifficulty.forRecentAdmissions(recent);

      expect(difficulty.isGreaterOrEqualThan(previous)).toBe(true);
      previous = difficulty;
    }
  });

  it('picks the harder of two requirements', () => {
    const quiet = IdentityAdmissionDifficulty.floor();
    const busy = IdentityAdmissionDifficulty.forRecentAdmissions(FREE * 2);

    expect(quiet.hardest(busy).isEqual(busy)).toBe(true);
    expect(busy.hardest(quiet).isEqual(busy)).toBe(true);
  });
});
