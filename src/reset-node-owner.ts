import 'module-alias/register';
import 'reflect-metadata';
import NodeOwnerResetCommand from '@app/apps/commands/nodes/NodeOwnerResetCommand';
import PigeonApplication from '@app/apps/PigeonApplication';
import LocalDatabaseIsLockedError from '@app/shared/infrastructure/local-db/LocalDatabaseIsLockedError';

/**
 * `yarn node:reset-owner <new owner identity id>`: hands a stopped node whose
 * owner key is lost to the new owner and clears the old owner's settings.
 */
async function run(): Promise<void> {
  try {
    // Checked before the application, and so the local database, starts.
    const newOwner = NodeOwnerResetCommand.newOwnerFrom(process.argv.slice(2));
    const application = new PigeonApplication();

    application.loadEnvironmentVariables();
    await application.dependencyInjection();
    const report = await application.resetNodeOwner(newOwner);

    // Exits once the report is flushed, so a piped report is not cut short.
    process.stdout.write(report, () => process.exit(0));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const hint =
      error instanceof LocalDatabaseIsLockedError
        ? '\nStop the node, then run yarn node:reset-owner again.'
        : '';

    process.stderr.write(`Owner reset failed: ${message}${hint}\n`, () =>
      process.exit(1),
    );
  }
}

if (require.main === module) {
  void run();
}
