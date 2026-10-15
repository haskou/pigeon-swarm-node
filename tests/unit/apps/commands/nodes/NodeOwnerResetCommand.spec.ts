import NodeOwnerResetCommand from '@app/apps/commands/nodes/NodeOwnerResetCommand';
import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import LocalDatabaseIsLockedError from '@app/shared/infrastructure/local-db/LocalDatabaseIsLockedError';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeOwnerResetCommand', () => {
  let resetter: MockProxy<NodeOwnerSettingsResetter>;
  let database: MockProxy<EmbeddedLocalDatabase>;
  let command: NodeOwnerResetCommand;

  beforeEach(() => {
    resetter = mock<NodeOwnerSettingsResetter>();
    database = mock<EmbeddedLocalDatabase>();
    command = new NodeOwnerResetCommand(resetter, database);
  });

  it('should report what it cleared and what it kept', async () => {
    resetter.reset.mockResolvedValue([
      new ClearedNodeOwnerSetting('node owner'),
      new ClearedNodeOwnerSetting('2 registration codes'),
    ]);

    await expect(command.run()).resolves.toBe(
      [
        'Cleared:',
        '  - node owner',
        '  - 2 registration codes',
        'Kept: node id, networks, relay configuration, identities, content and keys.',
        'Start the node; the next owner claim (PUT /node/owner) works as on an unclaimed node.',
        '',
      ].join('\n'),
    );
  });

  it('should say so when there was nothing to clear', async () => {
    resetter.reset.mockResolvedValue([]);

    await expect(command.run()).resolves.toMatch(
      /^Nothing to clear: the node has no owner settings\.\n/,
    );
  });

  it('should close the local database after the reset', async () => {
    resetter.reset.mockResolvedValue([]);

    await command.run();

    expect(database.close).toHaveBeenCalledTimes(1);
  });

  it('should close the local database and rethrow when the reset fails', async () => {
    const error = new LocalDatabaseIsLockedError('/data/local_storage');

    resetter.reset.mockRejectedValue(error);

    await expect(command.run()).rejects.toBe(error);
    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
