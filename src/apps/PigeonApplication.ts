import { Kernel } from '@haskou/ddd-kernel';
import dotenv from 'dotenv';
import path from 'path';

import NodeLoader from '../contexts/nodes/application/load/NodeLoader';
import Server from '../shared/infrastructure/express/Server';
import { Initializer } from '../shared/infrastructure/lifecycle/Initializer';
import { Runtime } from '../shared/infrastructure/lifecycle/Runtime';
import WinstonLogger from '../shared/infrastructure/logs/WinstonLogger';
import Scheduler from '../shared/infrastructure/scheduler/Scheduler';
import Consumer from '../shared/infrastructure/ui/consumers/Consumer';
import WebSocketClientMessageHandler from '../shared/infrastructure/websocket/WebSocketClientMessageHandler';
import { webSocketEventHub } from '../shared/infrastructure/websocket/WebSocketEventHub';
import { ApplicationServiceClass } from './ApplicationServiceClass';

export default class PigeonApplication {
  private readonly consumers: Consumer[] = [];
  private readonly server = new Server();
  private readonly logger = new WinstonLogger(this.server);
  private readonly kernel = new Kernel({
    logger: this.logger,
    sourceDirectory: path.resolve(__dirname, '..'),
  });

  private readonly schedulers: Scheduler[] = [];

  private getConsumerFromClass(
    ClassDefinition: ApplicationServiceClass<Consumer>,
  ): Consumer {
    return this.kernel.di.getService<Consumer>(ClassDefinition);
  }

  private getInitializerFromClass(
    ClassDefinition: ApplicationServiceClass<Initializer>,
  ): Initializer {
    return this.kernel.di.getService<Initializer>(ClassDefinition);
  }

  private getRuntimeFromClass(
    ClassDefinition: ApplicationServiceClass<Runtime>,
  ): Runtime {
    return this.kernel.di.getService<Runtime>(ClassDefinition);
  }

  private getSchedulerFromClass(
    ClassDefinition: ApplicationServiceClass<Scheduler>,
  ): Scheduler {
    return this.kernel.di.getService<Scheduler>(ClassDefinition);
  }

  public environmentVariables(
    env: string = (process.env.NODE_ENV = 'local'),
  ): void {
    dotenv.config({
      path: path.resolve(Kernel.rootDirectory, env ? '.env.' + env : '.env'),
    });
  }

  public async dependencyInjection(): Promise<void> {
    await this.kernel.dependencyInjection();
  }

  public configureWebSocketEventHub(): void {
    webSocketEventHub.setClientMessageHandler(
      this.kernel.di.getService<WebSocketClientMessageHandler>(
        WebSocketClientMessageHandler,
      ),
    );
  }

  public async runServer(): Promise<void> {
    await this.server.run();
  }

  public addConsumers(
    ...ClassDefinitions: ApplicationServiceClass<Consumer>[]
  ): void {
    for (const ClassDefinition of ClassDefinitions) {
      const consumer = this.getConsumerFromClass(ClassDefinition);

      this.consumers.push(consumer);
      this.kernel.registerConsumerInstances(
        consumer as unknown as Parameters<
          typeof this.kernel.registerConsumerInstances
        >[0],
      );
    }
  }

  public async runConsumers(): Promise<void> {
    for (const consumer of this.consumers) {
      await consumer.init();
    }
  }

  public addSchedulers(
    ...ClassDefinitions: ApplicationServiceClass<Scheduler>[]
  ): void {
    for (const ClassDefinition of ClassDefinitions) {
      this.schedulers.push(this.getSchedulerFromClass(ClassDefinition));
    }
  }

  public async runSchedulers(): Promise<void> {
    for (const scheduler of this.schedulers) {
      await scheduler.init();
    }
  }

  public async runInitializers(
    ...ClassDefinitions: ApplicationServiceClass<Initializer>[]
  ): Promise<void> {
    for (const ClassDefinition of ClassDefinitions) {
      await this.getInitializerFromClass(ClassDefinition).ensure();
    }
  }

  public async runRuntimes(
    ...ClassDefinitions: ApplicationServiceClass<Runtime>[]
  ): Promise<void> {
    for (const ClassDefinition of ClassDefinitions) {
      await this.getRuntimeFromClass(ClassDefinition).run();
    }
  }

  public async runSchedulerNowAndSchedule(
    ClassDefinition: ApplicationServiceClass<Scheduler>,
  ): Promise<void> {
    const scheduler = this.getSchedulerFromClass(ClassDefinition);

    await scheduler.runOnce();
    await scheduler.init();
  }

  public logs(prefix?: string): void {
    this.logger.run(prefix);
  }

  public async loadLocalNodeState(): Promise<void> {
    const nodeLoader = this.kernel.di.getService<NodeLoader>(NodeLoader);

    await nodeLoader.loadNode();
  }
}
