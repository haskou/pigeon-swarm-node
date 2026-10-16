import { StringValueObject } from '@haskou/value-objects';

import { NodeBlockEntries } from '../NodeBlockEntries';
import { NodeBlockList } from '../NodeBlockList';
import { NodeBlockSource } from '../NodeBlockSource';
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

  public static blockListPublication(): ClearedNodeOwnerSetting {
    return new ClearedNodeOwnerSetting('block list publication (now off)');
  }

  public static blockSource(source: NodeBlockSource): ClearedNodeOwnerSetting {
    const applied = source.applied().count();
    const pending = source.pending().count();

    return new ClearedNodeOwnerSetting(
      `block source ${source.getOwnerIdentityId().valueOf()} at ${source.getOrigin().valueOf()} (${applied} applied, ${pending} pending)`,
    );
  }

  public static blockExceptions(
    exceptions: NodeBlockEntries,
  ): ClearedNodeOwnerSetting {
    const identities = ClearedNodeOwnerSetting.counted(
      exceptions.getIdentityIds().length,
      'identity',
      'identities',
    );
    const nodes = ClearedNodeOwnerSetting.counted(
      exceptions.getNodePeerIds().length,
      'node',
      'nodes',
    );

    return new ClearedNodeOwnerSetting(
      `block exceptions (${identities}, ${nodes})`,
    );
  }
}
