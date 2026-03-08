import dotenv from 'dotenv';
import path from 'path';
import DependencyInjection from '@app/shared/infrastructure/dependencyInjection/DependencyInjection';
import Server from '@app/shared/infrastructure/express/Server';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Scheduler from './shared/infrastructure/scheduler/Scheduler';
import Consumer from './shared/infrastructure/ui/consumers/Consumer';

export default class Kernel {
  private static _di: DependencyInjection;
  private static _logs: WinstonLogger;
  private _server: Server = new Server();
  private static _consumers: Consumer[] = [];
  private static schedulers: Scheduler[] = [];

  public static get configDirectory(): string {
    return path.join(__dirname, '..', 'config');
  }

  public static get rootDirectory(): string {
    return path.join(__dirname, '..');
  }

  public static get sourceDirectory(): string {
    return __dirname;
  }

  public environmentVariables(
    env: string = (process.env.NODE_ENV = 'local'),
  ): void {
    dotenv.config({
      path: path.resolve(Kernel.rootDirectory, env ? '.env.' + env : '.env'),
    });
  }

  public async dependencyInjection(): Promise<void> {
    Kernel._di = new DependencyInjection();
    await Kernel._di.compile();
  }

  public static get di(): DependencyInjection {
    return Kernel._di;
  }

  public runServer(): void {
    this._server.run();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getConsumerFromClass(ClassDefinition: any): Consumer {
    return Kernel._di.getService(ClassDefinition) as Consumer;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public addConsumers(...ClassDefinitions: any): void {
    for (const ClassDefinition of ClassDefinitions) {
      const consumer = this.getConsumerFromClass(ClassDefinition);
      Kernel._consumers.push(consumer);
    }
  }

  public async runConsumers(): Promise<void> {
    for (const consumer of Kernel.consumers) {
      await consumer.init();
    }
  }

  public removeConsumers(): void {
    Kernel._consumers = [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSchedulerFromClass(ClassDefinition: any): Scheduler {
    return Kernel._di.getService(ClassDefinition) as Scheduler;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public addSchedulers(...ClassDefinitions: any): void {
    for (const ClassDefinition of ClassDefinitions) {
      const scheduler = this.getSchedulerFromClass(ClassDefinition);
      Kernel.schedulers.push(scheduler);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public addAcceptanceInstanceScheduler(instance: any): void {
    Kernel.schedulers.push(instance as Scheduler);
  }

  public removeSchedulers(): void {
    Kernel.schedulers = [];
  }

  public async runSchedulers(): Promise<void> {
    for (const scheduler of Kernel.schedulers) {
      await scheduler.init();
    }
  }

  public static get consumers(): Consumer[] {
    return this._consumers;
  }

  public logs(prefix?: string): void {
    Kernel._logs = new WinstonLogger(this._server);
    Kernel._logs.run(prefix);
  }

  public static get logger(): WinstonLogger {
    return this._logs;
  }
}
