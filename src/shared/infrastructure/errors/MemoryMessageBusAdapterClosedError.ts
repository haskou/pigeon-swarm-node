export default class MemoryMessageBusAdapterClosedError extends Error {
  constructor() {
    super('The in-memory message bus is closed');
  }
}
