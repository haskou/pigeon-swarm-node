export type RestHeaders =
  | Record<string, string>
  | {
      headers?: Record<string, string>;
    };
