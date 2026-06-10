# Frontend Changes

## Replicated State Readiness

Backend no usa MongoDB como almacenamiento de producto. El estado compartido entre
nodos se sirve desde OrbitDB replicado. Durante el arranque, o justo después de
añadir una red, puede haber una ventana en la que las stores replicadas todavía
no estén abiertas.

Cuando una ruta necesita estado replicado y ese estado no está listo, backend
responde:

```json
{
  "code": "ReplicatedStateNotReadyError",
  "message": "Replicated state is not ready yet. Retry after the node finishes opening and synchronizing its stores."
}
```

HTTP status: `503 Service Unavailable`.

Frontend debe tratarlo como estado temporal:

- mostrar loading/syncing en la vista afectada;
- reintentar con backoff corto;
- no convertirlo en logout ni en error permanente;
- no limpiar caches locales de UI por recibir este error.

## Affected Screens

Puede afectar a vistas que lean estado sincronizado:

- identidades, keychains y conversaciones;
- comunidades, canales, roles, invitaciones, requests y logs de moderación;
- mensajes, reacciones, pins y polls;
- presencia y notification settings;
- packs de stickers y librería de stickers;
- estado de replicación IPFS sincronizado.

## Local-Only State

El estado local no sincronizado sigue siendo local al nodo:

- drafts;
- push subscriptions;
- nonces de firma HTTP;
- rate limits;
- cache de link previews;
- cache de peers;
- owner/configuración local del nodo.

No hay cambios de payload esperados para esos endpoints por este cambio. La
diferencia es interna: se guardan en una DB embebida local del nodo en vez de
MongoDB.

## No Mongo Assumption

Frontend no debe asumir que backend tiene MongoDB ni esperar que el estado local
sea global entre nodos. Si una push subscription se registra en un nodo, solo ese
nodo la conoce.
