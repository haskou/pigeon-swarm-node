import { assert, Integer, Timestamp } from '@haskou/value-objects';

import { NodeRegistrationCodeExpiryIsOutOfRangeError } from './errors/NodeRegistrationCodeExpiryIsOutOfRangeError';
import { NodeRegistrationCodeIsNotValidError } from './errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationCodeMaxUsesIsOutOfRangeError } from './errors/NodeRegistrationCodeMaxUsesIsOutOfRangeError';
import { NodeRegistrationCodeLimits } from './NodeRegistrationCodeLimits';
import { NodeRegistrationCodePrimitives } from './NodeRegistrationCodePrimitives';
import { NodeRegistrationCodeHash } from './value-objects/NodeRegistrationCodeHash';
import { NodeRegistrationCodeId } from './value-objects/NodeRegistrationCodeId';
import { NodeRegistrationCodeSecret } from './value-objects/NodeRegistrationCodeSecret';

/**
 * A registration code the owner handed out. The node keeps only the hash of
 * the code and counts its uses locally; nothing about it replicates.
 */
export class NodeRegistrationCode {
  public static issue(
    secret: NodeRegistrationCodeSecret,
    maxUses: Integer,
    expiresAt: Timestamp,
    limits: NodeRegistrationCodeLimits,
    now: Timestamp,
  ): NodeRegistrationCode {
    assert(
      maxUses.isGreaterOrEqualThan(1) &&
        maxUses.isLessOrEqualThan(limits.maxUses),
      new NodeRegistrationCodeMaxUsesIsOutOfRangeError(limits.maxUses),
    );
    assert(
      expiresAt.isAfter(now) &&
        expiresAt.isBeforeOrEqual(now.addDays(limits.maxTtlDays)),
      new NodeRegistrationCodeExpiryIsOutOfRangeError(limits.maxTtlDays),
    );

    return new NodeRegistrationCode(
      NodeRegistrationCodeId.generate(),
      secret.hash(),
      maxUses,
      maxUses,
      expiresAt,
    );
  }

  public static fromPrimitives(
    primitives: NodeRegistrationCodePrimitives,
  ): NodeRegistrationCode {
    return new NodeRegistrationCode(
      new NodeRegistrationCodeId(primitives.id),
      new NodeRegistrationCodeHash(primitives.hash),
      new Integer(primitives.maxUses),
      new Integer(primitives.usesLeft),
      new Timestamp(primitives.expiresAt),
    );
  }

  constructor(
    private readonly id: NodeRegistrationCodeId,
    private readonly hash: NodeRegistrationCodeHash,
    private readonly maxUses: Integer,
    private usesLeft: Integer,
    private readonly expiresAt: Timestamp,
  ) {}

  public isUsableAt(now: Timestamp): boolean {
    return this.usesLeft.isGreaterThan(0) && now.isBefore(this.expiresAt);
  }

  public reserveUse(now: Timestamp): void {
    assert(this.isUsableAt(now), new NodeRegistrationCodeIsNotValidError());

    this.usesLeft = new Integer(this.usesLeft.subtract(1));
  }

  public releaseUse(): void {
    if (this.usesLeft.isGreaterOrEqualThan(this.maxUses)) {
      return;
    }

    this.usesLeft = new Integer(this.usesLeft.add(1));
  }

  public getId(): NodeRegistrationCodeId {
    return this.id;
  }

  public toPrimitives(): NodeRegistrationCodePrimitives {
    return {
      expiresAt: this.expiresAt.valueOf(),
      hash: this.hash.valueOf(),
      id: this.id.valueOf(),
      maxUses: this.maxUses.valueOf(),
      usesLeft: this.usesLeft.valueOf(),
    };
  }
}
