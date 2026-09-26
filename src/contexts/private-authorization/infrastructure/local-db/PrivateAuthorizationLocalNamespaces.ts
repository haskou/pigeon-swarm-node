export const PrivateAuthorizationLocalNamespaces = Object.freeze({
  mls: 'private_authorization_mls',
  outbox: 'private_authorization_outbox',
  pending: 'private_authorization_pending',
  projections: 'private_authorization_projections',
  receipts: 'private_authorization_receipts',
  replay: 'private_authorization_replay',
  reservations: 'private_authorization_reservations',
  scopes: 'private_authorization_scopes',
});

export const privateAuthorizationLocalId = (
  scopeId: string,
  id: string,
): string => `${scopeId}:${id}`;
