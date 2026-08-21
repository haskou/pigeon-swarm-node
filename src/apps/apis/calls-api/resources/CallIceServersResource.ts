import { CallIceServerResource } from './CallIceServerResource';
import { CallIceServersDiagnosticsResource } from './CallIceServersDiagnosticsResource';

export { CallIceServerResource } from './CallIceServerResource';

export type CallIceServersResource = {
  diagnostics: CallIceServersDiagnosticsResource;
  iceServers: CallIceServerResource[];
  iceTransportPolicy: 'all' | 'relay';
};
