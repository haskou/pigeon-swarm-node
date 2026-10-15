import { NodeRegistrationCodeExpiryIsOutOfRangeError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeExpiryIsOutOfRangeError';
import { NodeRegistrationCodeIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationCodeMaxUsesIsOutOfRangeError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeMaxUsesIsOutOfRangeError';
import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { Integer, Timestamp } from '@haskou/value-objects';

describe('NodeRegistrationCode', () => {
  const now = new Timestamp(1_700_000_000_000);
  const limits = new NodeRegistrationCodeLimits(10, 30);
  const secret = new NodeRegistrationCodeSecret('a-code');

  const issue = (
    maxUses = 2,
    expiresAt = now.addDays(1),
  ): NodeRegistrationCode =>
    NodeRegistrationCode.issue(
      secret,
      new Integer(maxUses),
      expiresAt,
      limits,
      now,
    );

  it('should store the hash of the code and never the code', () => {
    const primitives = issue().toPrimitives();

    expect(primitives.hash).toBe(secret.hash().valueOf());
    expect(JSON.stringify(primitives)).not.toContain('a-code');
    expect(primitives.usesLeft).toBe(2);
    expect(primitives.maxUses).toBe(2);
  });

  it.each([0, 11])('should refuse %s max uses', (maxUses) => {
    expect(() => issue(maxUses)).toThrow(
      NodeRegistrationCodeMaxUsesIsOutOfRangeError,
    );
  });

  it('should refuse an expiry in the past', () => {
    expect(() => issue(1, now)).toThrow(
      NodeRegistrationCodeExpiryIsOutOfRangeError,
    );
  });

  it('should refuse an expiry beyond the maximum lifetime', () => {
    expect(() =>
      issue(1, new Timestamp(now.addDays(30).valueOf() + 1)),
    ).toThrow(NodeRegistrationCodeExpiryIsOutOfRangeError);
  });

  it('should accept an expiry at the maximum lifetime', () => {
    expect(() => issue(1, now.addDays(30))).not.toThrow();
  });

  it('should count reserved uses down and refuse once used up', () => {
    const code = issue(1);

    code.reserveUse(now);

    expect(code.isUsableAt(now)).toBe(false);
    expect(() => code.reserveUse(now)).toThrow(
      NodeRegistrationCodeIsNotValidError,
    );
  });

  it('should give a released use back without exceeding max uses', () => {
    const code = issue(1);

    code.reserveUse(now);
    code.releaseUse();
    code.releaseUse();

    expect(code.toPrimitives().usesLeft).toBe(1);
  });

  it('should not be usable once expired', () => {
    const code = issue(1);

    expect(code.isUsableAt(now.addDays(1))).toBe(false);
  });
});
