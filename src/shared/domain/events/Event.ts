interface Event {
  eventName(): string;
  decode(): string;
  encode(data: string): object;
}

export default Event;
