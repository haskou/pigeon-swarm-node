import { Enum } from '@haskou/value-objects';

import { InvalidContentReplicationPriorityError } from '../errors/InvalidContentReplicationPriorityError';

const priorities = {
  COLD: 'cold',
  CRITICAL: 'critical',
  NORMAL: 'normal',
} as const;

export class ContentReplicationPriority extends Enum<string> {
  public static readonly COLD = new ContentReplicationPriority(priorities.COLD);

  public static readonly CRITICAL = new ContentReplicationPriority(
    priorities.CRITICAL,
  );

  public static readonly NORMAL = new ContentReplicationPriority(
    priorities.NORMAL,
  );

  public static fromValue(value: string): ContentReplicationPriority {
    switch (value) {
      case priorities.COLD:
        return ContentReplicationPriority.COLD;
      case priorities.CRITICAL:
        return ContentReplicationPriority.CRITICAL;
      case priorities.NORMAL:
        return ContentReplicationPriority.NORMAL;
      default:
        throw new InvalidContentReplicationPriorityError(value);
    }
  }

  public getValues(): string[] {
    return Object.values(priorities);
  }
}
