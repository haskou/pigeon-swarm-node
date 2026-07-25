import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import { RelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import Kernel from '@haskou/ddd-kernel';

import { CallTurnRuntimeConfiguration } from './CallTurnRuntimeConfiguration';
import CallTurnRuntimeConfigurationPublisher from './CallTurnRuntimeConfigurationPublisher';

export default class CallTurnConfigurationRuntime implements Runtime {
  private publicationQueue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly publisher: CallTurnRuntimeConfigurationPublisher,
  ) {}

  private publish(settings: RelayRuntimeSettings): Promise<void> {
    const configuration =
      CallTurnRuntimeConfiguration.fromRelaySettings(settings);
    const publication = (): Promise<void> =>
      this.publisher.publish(configuration).then(() => {
        Kernel.logger.info(
          `Calls TURN runtime configuration published: enabled=${configuration.isEnabled()}`,
        );
      });

    this.publicationQueue = this.publicationQueue.then(
      publication,
      publication,
    );

    return this.publicationQueue;
  }

  public async run(): Promise<void> {
    this.networkRegistry.onRelaySettingsChanged((settings) =>
      this.publish(settings),
    );

    await this.publish(this.networkRegistry.getRelaySettings());
  }
}
