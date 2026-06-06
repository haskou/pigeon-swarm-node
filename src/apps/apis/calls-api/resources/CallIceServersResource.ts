import { CallIceServerResource } from './CallIceServerResource';

export { CallIceServerResource } from './CallIceServerResource';

export type CallIceServersResource = {
  iceServers: CallIceServerResource[];
  iceTransportPolicy: 'all' | 'relay';
};
