import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { webSocketEventHub } from './WebSocketEventHub';

export default class LocalRealtimeEventPublisher {
  public publish(events: DomainEvent[]): void {
    webSocketEventHub.publish(events);
  }
}
