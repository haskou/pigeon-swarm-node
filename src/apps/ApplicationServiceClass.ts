export type ApplicationServiceClass<T> = {
  readonly prototype: T;
  new (...args: never[]): T;
};
