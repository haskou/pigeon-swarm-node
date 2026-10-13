import { Enum } from '@haskou/value-objects';

import { PrivateBlobPrimitives } from '../PrivateBlobPrimitives';

const privateBlobStatuses = {
  RESERVED: 'reserved',
  STORED: 'stored',
} as const;

/** Reserved until its bytes are uploaded; stored and immutable afterwards. */
export class PrivateBlobStatus extends Enum<PrivateBlobPrimitives['state']> {
  public static readonly RESERVED = new PrivateBlobStatus(
    privateBlobStatuses.RESERVED,
  );

  public static readonly STORED = new PrivateBlobStatus(
    privateBlobStatuses.STORED,
  );

  public static fromPrimitives(
    value: PrivateBlobPrimitives['state'],
  ): PrivateBlobStatus {
    return new PrivateBlobStatus(value);
  }

  public getValues(): PrivateBlobPrimitives['state'][] {
    return Object.values(privateBlobStatuses);
  }

  public isStored(): boolean {
    return this.isEqual(PrivateBlobStatus.STORED);
  }
}
