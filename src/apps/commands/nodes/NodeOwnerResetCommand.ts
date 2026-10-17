import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { NodeOwnerResetUsageError } from './errors/NodeOwnerResetUsageError';

/**
 * `yarn node:reset-owner <new owner identity id>`: the node operator's way
 * back in after the owner key is lost. Runs on the host against the stopped
 * node's local database and installs the new owner right away, so the node is
 * never open to an owner claim.
 */
export default class NodeOwnerResetCommand {
  private static readonly KEPT =
    'Kept: node id, networks, relay configuration, identities, content and keys.';

  /** Reads the new owner from the command arguments, before any database is opened. */
  public static newOwnerFrom(args: string[]): IdentityId {
    const [newOwner, ...rest] = args;

    if (!newOwner || rest.length > 0) {
      throw NodeOwnerResetUsageError.missingNewOwner();
    }

    try {
      const identityId = new IdentityId(newOwner);

      if (identityId.isCanonicalKey()) {
        return identityId;
      }
    } catch {
      // Not shaped like an identity id at all: refused below, never echoed.
    }

    throw NodeOwnerResetUsageError.invalidNewOwner();
  }

  constructor(
    private readonly resetter: NodeOwnerSettingsResetter,
    private readonly database: EmbeddedLocalDatabase,
  ) {}

  /** Installs the new owner, clears the owner settings and returns the report for the operator. */
  public async run(newOwner: IdentityId): Promise<string> {
    try {
      const cleared = await this.resetter.reset(newOwner);
      const clearedLines =
        cleared.length === 0
          ? []
          : [
              'Cleared:',
              ...cleared.map((setting) => `  - ${setting.valueOf()}`),
            ];

      return [
        `New node owner: ${newOwner.valueOf()}`,
        ...clearedLines,
        NodeOwnerResetCommand.KEPT,
        'Start the node; only the new owner can sign owner requests.',
        '',
      ].join('\n');
    } finally {
      await this.database.close();
    }
  }
}
