import 'module-alias/register';
import 'reflect-metadata';
import PigeonApplication from '@app/apps/PigeonApplication';
import LocalDatabaseIsLockedError from '@app/shared/infrastructure/local-db/LocalDatabaseIsLockedError';

/** `yarn node:reset-owner`: clears the node owner settings of a stopped node. */
async function run(): Promise<void> {
  try {
    const application = new PigeonApplication();

    application.loadEnvironmentVariables();
    await application.dependencyInjection();
    process.stdout.write(await application.resetNodeOwner());
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const hint =
      error instanceof LocalDatabaseIsLockedError
        ? '\nStop the node, then run yarn node:reset-owner again.'
        : '';

    process.stderr.write(`Owner reset failed: ${message}${hint}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  void run();
}
