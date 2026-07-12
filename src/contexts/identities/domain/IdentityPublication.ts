import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Profile } from './Profile';
import { IdentityExternalIdentifier } from './value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from './value-objects/IdentityVersion';
import { ProfileHandle } from './value-objects/ProfileHandle';

export class IdentityPublication {
  public static fromPrimitives(
    primitives: PrimitiveOf<IdentityPublication>,
  ): IdentityPublication {
    return new IdentityPublication(
      Profile.fromPrimitives(primitives.profile),
      new Timestamp(primitives.timestamp),
      new Signature(primitives.signature),
      new IdentityVersion(primitives.version),
      primitives.previousIdentityExternalIdentifier
        ? new IdentityExternalIdentifier(
            primitives.previousIdentityExternalIdentifier,
          )
        : undefined,
    );
  }

  constructor(
    private readonly profile: Profile,
    private readonly timestamp: Timestamp,
    private readonly signature: Signature,
    private readonly version: IdentityVersion,
    private readonly previousIdentityExternalIdentifier?: IdentityExternalIdentifier,
  ) {}

  public hasHandle(handle: ProfileHandle): boolean {
    return this.profile.hasHandle(handle);
  }

  public hasNoPreviousReference(): boolean {
    return this.previousIdentityExternalIdentifier === undefined;
  }

  public getPreviousReference(): IdentityExternalIdentifier | undefined {
    return this.previousIdentityExternalIdentifier;
  }

  public isFirstVersion(): boolean {
    return this.version.isFirst();
  }

  public isNewerThan(other: IdentityPublication): boolean {
    return this.version.isGreaterThan(other.version);
  }

  public isNextVersionAfter(previous: IdentityPublication): boolean {
    return this.version.isNextAfter(previous.version);
  }

  public nextVersion(): IdentityVersion {
    return this.version.next();
  }

  public getSignature(): Signature {
    return this.signature;
  }

  public toPrimitives() {
    return {
      previousIdentityExternalIdentifier:
        this.previousIdentityExternalIdentifier?.valueOf(),
      profile: this.profile.toPrimitives(),
      signature: this.signature.valueOf(),
      timestamp: this.timestamp.valueOf(),
      version: this.version.valueOf(),
    };
  }
}
