# Relay publico para IPFS, OrbitDB y gossip

## Contexto

La rama `tmp/pr-132-public-relay-system` funcionaba porque no dependia solo
de la replicacion por OrbitDB: tambien levantaba y publicaba un relay publico,
anunciaba registros firmados de ese relay y hacia que los nodos privados
dialearan esos multiaddrs. Esa rama tambien traia mucho codigo obsoleto de
sincronizacion con Mongo y eventos como `NetworkSyncRequested`.

En la rama `fix/orbitdb-repair-after-replication` el flujo de sincronizacion
vive en OrbitDB, asi que no se debe portar el sistema antiguo de Mongo ni los
eventos `NetworkSyncRequested`. Lo necesario es portar la conectividad de red
que permitia que IPFS, OrbitDB y gossip encontraran peers a traves del relay.

## Que se conserva de la rama antigua

- Runtime de relay publico con `PIGEON_RELAY_ENABLED`,
  `PIGEON_RELAY_AUTO_ENABLE`, `PIGEON_PUBLIC_HOST` y `PIGEON_RELAY_PORT`.
- Publicacion de registros publicos firmados del relay en pubsub.
- Cache local de registros publicos de relay como fallback temporal.
- Dial automatico de relays configurados en `PIGEON_BOOTSTRAP_RELAY_MULTIADDRS`.
- Dial automatico de relays descubiertos por pubsub.
- Publicacion de providers de contenido y registros para que el routing de IPFS
  pueda encontrar el nodo que tiene el dato.
- Soporte para block brokers en conexiones limitadas por relay.

## Que no se porta

- Sincronizacion basada en Mongo.
- `NetworkSyncRequested` y consumidores asociados.
- Repositorios o proyecciones de estado antiguas que duplicaban el trabajo de
  OrbitDB.
- Runtimes que reintroduzcan una segunda fuente de verdad para la replicacion.

## Flujo esperado

1. Si `PIGEON_RELAY_ENABLED=true`, el nodo arranca un relay publico y lo anuncia
   con `PIGEON_PUBLIC_HOST` y `PIGEON_RELAY_PORT`.
2. El relay publica un registro publico firmado en el topic
   `pigeon-swarm.public-relays.v1`.
3. Los nodos privados escuchan esos registros desde su conexion publica de IPFS
   y los guardan en la cache local.
4. Las redes privadas de IPFS dialean los relays configurados o descubiertos.
5. Cuando IPFS escribe contenido o registros, publica providers en routing.
6. OrbitDB y gossip se benefician de esos peers libp2p ya conectados, sin
   necesitar el flujo antiguo de Mongo.

## Variables relevantes

- `PIGEON_RELAY_ENABLED=true`: fuerza el arranque del relay publico.
- `PIGEON_RELAY_AUTO_ENABLE=true`: permite que un nodo con host publico arranque
  como relay si no conoce otro relay activo.
- `PIGEON_PUBLIC_HOST`: host anunciado para que otros nodos puedan dialear.
- `PIGEON_RELAY_PORT`: puerto publico del relay.
- `PIGEON_LIBP2P_PORT`: puerto libp2p publico opcional del nodo relay.
- `PIGEON_BOOTSTRAP_RELAY_MULTIADDRS`: lista separada por comas de relays
  conocidos para bootstrap.
- `PIGEON_RELAY_DISCOVERY_ENABLED=false`: desactiva el descubrimiento publico si
  se necesita aislar el nodo.
- `PIGEON_RELAY_RECORD_TTL_SECONDS`: TTL de registros publicos de relay.
- `PIGEON_RELAY_RECORD_TTL_MS`: TTL de registros privados de relay.

## Criterio de funcionamiento

El cambio se considera correcto cuando un nodo sin conectividad directa puede:

- descubrir o recibir multiaddrs de relay;
- dialear el relay desde su libp2p privado;
- publicar providers de contenido y registros IPFS;
- recuperar contenido y registros a traves de peers/proveedores encontrados por
  routing;
- replicar OrbitDB y mantener gossip usando la conectividad libp2p resultante.
