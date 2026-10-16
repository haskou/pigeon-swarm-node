import { NodeOwnerResetUsageError } from '@app/apps/commands/nodes/errors/NodeOwnerResetUsageError';
import NodeOwnerResetCommand from '@app/apps/commands/nodes/NodeOwnerResetCommand';
import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import LocalDatabaseIsLockedError from '@app/shared/infrastructure/local-db/LocalDatabaseIsLockedError';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityIdMother } from '../../../mothers/IdentityIdMother';
import { NodeBlockListMother } from '../../../mothers/NodeBlockListMother';

describe('NodeOwnerResetCommand', () => {
  let resetter: MockProxy<NodeOwnerSettingsResetter>;
  let database: MockProxy<EmbeddedLocalDatabase>;
  let command: NodeOwnerResetCommand;
  let newOwner: IdentityId;

  beforeEach(async () => {
    resetter = mock<NodeOwnerSettingsResetter>();
    database = mock<EmbeddedLocalDatabase>();
    command = new NodeOwnerResetCommand(resetter, database);
    newOwner = await NodeBlockListMother.identityId();
  });

  it('should install the named owner and report what it cleared and kept', async () => {
    resetter.reset.mockResolvedValue([
      new ClearedNodeOwnerSetting('previous node owner'),
      new ClearedNodeOwnerSetting('2 registration codes'),
    ]);

    await expect(command.run(newOwner)).resolves.toBe(
      [
        `New node owner: ${newOwner.valueOf()}`,
        'Cleared:',
        '  - previous node owner',
        '  - 2 registration codes',
        'Kept: node id, networks, relay configuration, identities, content and keys.',
        'Start the node; only the new owner can sign owner requests.',
        '',
      ].join('\n'),
    );
    expect(resetter.reset).toHaveBeenCalledWith(newOwner);
  });

  it('should leave out the cleared list when there was nothing else to clear', async () => {
    resetter.reset.mockResolvedValue([]);

    await expect(command.run(newOwner)).resolves.toBe(
      [
        `New node owner: ${newOwner.valueOf()}`,
        'Kept: node id, networks, relay configuration, identities, content and keys.',
        'Start the node; only the new owner can sign owner requests.',
        '',
      ].join('\n'),
    );
  });

  it('should read the new owner from the only argument', () => {
    expect(NodeOwnerResetCommand.newOwnerFrom([newOwner.valueOf()])).toEqual(
      newOwner,
    );
  });

  it.each([
    ['no argument', []],
    ['an empty id', ['']],
    ['an id that is not a public key', ['not-an-identity']],
    ['more than one argument', ['a', 'b']],
  ])('should refuse %s', (_case, args: string[]) => {
    expect(() => NodeOwnerResetCommand.newOwnerFrom(args)).toThrow(
      NodeOwnerResetUsageError,
    );
  });

  it('should explain the usage when the new owner is missing', () => {
    expect(() => NodeOwnerResetCommand.newOwnerFrom([])).toThrow(
      'Name the new node owner: yarn node:reset-owner <new owner identity id>',
    );
  });

  it('should not echo an argument that is not an identity id', () => {
    expect(() =>
      NodeOwnerResetCommand.newOwnerFrom(['not-an-identity']),
    ).toThrow(
      'The new node owner must be an identity id: yarn node:reset-owner <new owner identity id>',
    );
  });

  it.each(IdentityIdMother.forged())(
    'should refuse an id with %s, which is not a usable identity key',
    (_case, forged: IdentityId) => {
      expect(() =>
        NodeOwnerResetCommand.newOwnerFrom([forged.valueOf()]),
      ).toThrow(
        'The new node owner must be an identity id: yarn node:reset-owner <new owner identity id>',
      );
    },
  );

  it('should close the local database after the reset', async () => {
    resetter.reset.mockResolvedValue([]);

    await command.run(newOwner);

    expect(database.close).toHaveBeenCalledTimes(1);
  });

  it('should close the local database and rethrow when the reset fails', async () => {
    const error = new LocalDatabaseIsLockedError('/data/local_storage');

    resetter.reset.mockRejectedValue(error);

    await expect(command.run(newOwner)).rejects.toBe(error);
    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
