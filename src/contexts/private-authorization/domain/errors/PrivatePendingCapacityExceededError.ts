export class PrivatePendingCapacityExceededError extends Error {
  public constructor() {
    super('Private pending capacity exceeded');
    this.name = PrivatePendingCapacityExceededError.name;
  }
}
