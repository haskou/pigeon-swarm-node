import { BeforeAll } from '@cucumber/cucumber';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

BeforeAll(async () => {
  const localDatabasePath = path.join(
    os.tmpdir(),
    `pigeon-swarm-consumer-local-db-${process.pid}`,
  );

  await fs.emptyDir(localDatabasePath);

  process.env.PIGEON_LOCAL_DB_PATH = localDatabasePath;
});
