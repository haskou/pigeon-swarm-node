export type ListenerTarget = {
  addEventListener?: (
    eventName: string,
    listener: (event: unknown) => void,
  ) => void;
};
