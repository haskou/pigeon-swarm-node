import Event from './Event';

export type EventConstructor<TEvent extends Event = Event> = abstract new (
  ...args: unknown[]
) => TEvent;
