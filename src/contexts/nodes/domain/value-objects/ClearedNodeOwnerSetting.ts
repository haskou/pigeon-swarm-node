import { StringValueObject } from '@haskou/value-objects';

import { NodeBlockList } from '../NodeBlockList';
import { NodeRegistrationMode } from './NodeRegistrationMode';

/** One owner setting an owner reset removed, worded for the node operator. */
export class ClearedNodeOwnerSetting extends StringValueObject {
  private static counted(
    count: number,
    singular: string,
    plural: string,
  ): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  public static previousOwner(): ClearedNodeOwnerSetting {
    return new ClearedNodeOwnerSetting('previous node owner');
  }

  public static registrationMode(
    mode: NodeRegistrationMode,
  ): ClearedNodeOwnerSetting {
    return new ClearedNodeOwnerSetting(
      `registration mode ${mode.valueOf()} (now open)`,
    );
  }

  public static registrationCodes(count: number): ClearedNodeOwnerSetting {
    return new ClearedNodeOwnerSetting(
      ClearedNodeOwnerSetting.counted(
        count,
        'registration code',
        'registration codes',
      ),
    );
  }

  public static ownBlockList(list: NodeBlockList): ClearedNodeOwnerSetting {
    const { blockedIdentityIds, blockedNodePeerIds, version } =
      list.toPrimitives();
    const identities = ClearedNodeOwnerSetting.counted(
      blockedIdentityIds.length,
      'identity',
      'identities',
    );
    const nodes = ClearedNodeOwnerSetting.counted(
      blockedNodePeerIds.length,
      'node',
      'nodes',
    );

    return new ClearedNodeOwnerSetting(
      `own block list version ${version} (${identities}, ${nodes})`,
    );
  }
}
