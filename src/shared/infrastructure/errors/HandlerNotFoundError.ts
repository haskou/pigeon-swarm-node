export default class HandlerNotFoundError extends Error {
  constructor(handlerName: string) {
    super(`Handler ${handlerName} not found.`);
  }
}
