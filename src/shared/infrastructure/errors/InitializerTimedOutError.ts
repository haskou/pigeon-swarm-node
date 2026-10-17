export default class InitializerTimedOutError extends Error {
  constructor(initializerName: string, timeoutMs: number) {
    super(
      `Initializer ${initializerName} did not finish within ${timeoutMs} ms`,
    );
  }
}
