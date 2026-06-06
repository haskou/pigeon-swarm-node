import { Enum } from '@haskou/value-objects';

import { InvalidIPFSContentReplicationPriorityError } from '../errors/InvalidIPFSContentReplicationPriorityError';
import { PriorityValue } from './types/PriorityValue';

const priorities: Record<string, PriorityValue> = {
  COLD: 'cold',
  CRITICAL: 'critical',
  NORMAL: 'normal',
};

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

  public getValues(): PriorityValue[] {
    return Object.values(priorities);
  }
}
