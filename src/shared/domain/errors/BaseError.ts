export default abstract class BaseError extends Error {
  protected constructor(
    message: string,
    prototype: object = BaseError.prototype,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, prototype);
  }

  public toString(): string {
    return `[${this.name}]: ${this.message}`;
  }

  public getStack(): string {
    return this.stack || '';
  }
}
