import { Enum } from '@haskou/value-objects';

import { InvalidIPFSContentReplicationPriorityError } from '../errors/InvalidIPFSContentReplicationPriorityError';

export type IPFSContentReplicationPriorityValue =
  | 'cold'
  | 'critical'
  | 'normal';

const priorities: Record<string, IPFSContentReplicationPriorityValue> = {
  COLD: 'cold',
  CRITICAL: 'critical',
  NORMAL: 'normal',
};

type PriorityValue = IPFSContentReplicationPriorityValue;

export class IPFSContentReplicationPriority extends Enum<PriorityValue> {
  public static readonly COLD = new IPFSContentReplicationPriority(
    priorities.COLD,
  );

  public static readonly CRITICAL = new IPFSContentReplicationPriority(
    priorities.CRITICAL,
  );

  public static readonly NORMAL = new IPFSContentReplicationPriority(
    priorities.NORMAL,
  );

  public static fromValue(value: string): IPFSContentReplicationPriority {
    switch (value) {
      case priorities.COLD:
        return IPFSContentReplicationPriority.COLD;
      case priorities.CRITICAL:
        return IPFSContentReplicationPriority.CRITICAL;
      case priorities.NORMAL:
        return IPFSContentReplicationPriority.NORMAL;
      default:
        throw new InvalidIPFSContentReplicationPriorityError(value);
    }
  }

  public getValues(): IPFSContentReplicationPriorityValue[] {
    return Object.values(priorities);
  }
}
