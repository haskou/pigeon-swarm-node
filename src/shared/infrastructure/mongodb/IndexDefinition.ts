export type IndexDefinition = {
  readonly collection: string;
  readonly keys: ReadonlyArray<readonly [string, 1 | -1]>;
  readonly name: string;
};
