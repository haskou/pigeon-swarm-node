import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { CallTurnRuntimeConfiguration } from '@app/shared/infrastructure/network/relay/CallTurnRuntimeConfiguration';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import path from 'path';

export default class CallTurnRuntimeConfigurationPublisher {
  private get configurationPath(): string {
    return path.resolve(pigeonEnvironment().PIGEON_TURN_RUNTIME_CONFIG_PATH);
  }

  public async publish(
    configuration: CallTurnRuntimeConfiguration,
  ): Promise<void> {
    const temporaryPath = `${this.configurationPath}.${process.pid}.tmp`;

    await mkdir(path.dirname(this.configurationPath), { recursive: true });

    try {
      await writeFile(temporaryPath, configuration.serialize(), {
        encoding: 'utf8',
        mode: 0o644,
      });
      await rename(temporaryPath, this.configurationPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}
