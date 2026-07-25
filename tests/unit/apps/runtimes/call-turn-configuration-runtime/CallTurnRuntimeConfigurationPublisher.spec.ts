import { CallTurnRuntimeConfiguration } from '@app/apps/runtimes/call-turn-configuration-runtime/CallTurnRuntimeConfiguration';
import CallTurnRuntimeConfigurationPublisher from '@app/apps/runtimes/call-turn-configuration-runtime/CallTurnRuntimeConfigurationPublisher';
import { normalizeRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('CallTurnRuntimeConfigurationPublisher', () => {
  let directory: string;
  let previousConfigurationPath: string | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'pigeon-turn-runtime-'));
    previousConfigurationPath =
      process.env.PIGEON_TURN_RUNTIME_CONFIG_PATH;
    process.env.PIGEON_TURN_RUNTIME_CONFIG_PATH = path.join(
      directory,
      'runtime',
      'calls-turn.conf',
    );
  });

  afterEach(async () => {
    if (previousConfigurationPath === undefined) {
      delete process.env.PIGEON_TURN_RUNTIME_CONFIG_PATH;
    } else {
      process.env.PIGEON_TURN_RUNTIME_CONFIG_PATH =
        previousConfigurationPath;
    }

    await rm(directory, { force: true, recursive: true });
  });

  it('should atomically publish the runtime configuration', async () => {
    const configuration = CallTurnRuntimeConfiguration.fromRelaySettings(
      normalizeRelayRuntimeSettings({
        callsRelay: { port: 4101 },
        privateRelay: {
          enabled: true,
          portEnd: 4105,
          portStart: 4102,
        },
        publicHost: 'relay.example.test',
      }),
    );

    await new CallTurnRuntimeConfigurationPublisher().publish(configuration);

    await expect(
      readFile(process.env.PIGEON_TURN_RUNTIME_CONFIG_PATH!, 'utf8'),
    ).resolves.toContain('listening_port=4101');
  });
});
