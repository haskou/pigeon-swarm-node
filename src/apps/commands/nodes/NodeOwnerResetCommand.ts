import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

/**
 * `yarn node:reset-owner`: the node operator's way back in after the owner
 * key is lost. Runs on the host against the stopped node's local database.
 */
export default class NodeOwnerResetCommand {
  private static readonly KEPT =
    'Kept: node id, networks, relay configuration, identities, content and keys.';

  constructor(
    private readonly resetter: NodeOwnerSettingsResetter,
    private readonly database: EmbeddedLocalDatabase,
  ) {}

  /** Clears the owner settings and returns the report for the operator. */
  public async run(): Promise<string> {
    try {
      const cleared = await this.resetter.reset();

      if (cleared.length === 0) {
        return [
          'Nothing to clear: the node has no owner settings.',
          NodeOwnerResetCommand.KEPT,
          '',
        ].join('\n');
      }

      return [
        'Cleared:',
        ...cleared.map((setting) => `  - ${setting.valueOf()}`),
        NodeOwnerResetCommand.KEPT,
        'Start the node; the next owner claim (PUT /node/owner) works as on an unclaimed node.',
        '',
      ].join('\n');
    } finally {
      await this.database.close();
    }
  }
}
