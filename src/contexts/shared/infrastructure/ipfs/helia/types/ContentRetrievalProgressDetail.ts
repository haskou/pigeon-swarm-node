export type ContentRetrievalProgressDetail = {
  provider?: {
    id?: { toString: () => string };
    routing?: string;
  };
  sender?: { toString: () => string };
};
