export type CallIceServerResource = {
  credential?: string;
  urls: string[];
  username?: string;
};

export type CallIceServersResource = {
  iceServers: CallIceServerResource[];
  iceTransportPolicy: 'all' | 'relay';
};
