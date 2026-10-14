import { DiagnosticsSession } from '@app/contexts/diagnostics/domain/DiagnosticsSession';

import { NodeDiagnosticsResource } from '../resources/NodeDiagnosticsResource';

export class NodeDiagnosticsViewModel {
  constructor(private readonly session: DiagnosticsSession) {}

  public toResource(): NodeDiagnosticsResource {
    const primitives = this.session.toPrimitives();

    return {
      closesAt: primitives.closesAt,
      discardsAt: primitives.discardsAt,
      entries: primitives.entries,
      openedAt: primitives.openedAt,
    };
  }
}
