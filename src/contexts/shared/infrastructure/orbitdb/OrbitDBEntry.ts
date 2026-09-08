export type OrbitDBEntry = {
  hash?: string;
  next?: string[];
  payload?: {
    key?: string;
    value?: unknown;
  };
};
