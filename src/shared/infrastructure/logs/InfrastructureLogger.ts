/* eslint-disable no-console */

export default class InfrastructureLogger {
  private static debugEnabled(): boolean {
    return (
      process.env.LOG_LEVEL === 'debug' || process.env.DEBUG_NETWORK === 'true'
    );
  }

  public static debug(message: string): void {
    if (!InfrastructureLogger.debugEnabled()) {
      return;
    }

    console.debug(message);
  }

  public static error(message: string): void {
    console.error(message);
  }

  public static info(message: string): void {
    console.info(message);
  }

  public static warn(message: string): void {
    console.warn(message);
  }
}
