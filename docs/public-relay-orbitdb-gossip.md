# Relay para IPFS privado, OrbitDB y gossip

## Contexto

La rama `tmp/pr-132-public-relay-system` funcionaba porque no dependia solo de
replicacion por OrbitDB: tambien publicaba un relay alcanzable en el plano IPFS
publico y hacia que los nodos privados dialeasen ese multiaddr. Esa rama traia
mucho codigo obsoleto de sincronizacion con Mongo y eventos como
`NetworkSyncRequested`.

En la rama `fix/orbitdb-repair-after-replication` el flujo de sincronizacion
vive en OrbitDB, asi que no se debe portar el sistema antiguo de Mongo ni los
eventos `NetworkSyncRequested`. Lo necesario es portar la conectividad de red
que permitia que IPFS, OrbitDB y gossip encontraran peers a traves del relay.

## Diagnostico de los logs del 2026-06-14

Los logs muestran dos cosas distintas:

- `Private IPFS relay bootstrap disabled` no es el fallo. Solo indica que no se
  ha configurado `PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS`, que es un override
  manual para hardcodear multiaddrs de relay mientras el discovery automatico no
  esta listo.
- Produccion anuncia el relay privado en
  `/dns4/teamspeak.futoineko.com/tcp/4181`, pero una comprobacion TCP externa a
  `teamspeak.futoineko.com:4181` devuelve `ECONNREFUSED`. Aunque el record se
  publique correctamente en IPFS publico, un nodo local no puede conectarse a un
  puerto cerrado o no publicado por Docker/firewall.

El relay privado debe escuchar con la misma pre-shared key que la red privada.
Los IPFS privados rechazan conexiones que no compartan esa clave. Por eso el
record publicado en IPFS publico tiene que anunciar un relay privado realmente
alcanzable desde fuera del host.

## Que se conserva de la rama antigua cuando aplica

- Runtime de relay publico con `PIGEON_RELAY_ENABLED`,
  `PIGEON_RELAY_AUTO_ENABLE`, `PIGEON_PUBLIC_HOST` y `PIGEON_RELAY_PORT`.
- Publicacion de registros publicos firmados del relay en pubsub.
- Cache local de registros publicos de relay como fallback temporal.
- Dial automatico de relays configurados en `PIGEON_BOOTSTRAP_RELAY_MULTIADDRS`.
- Dial automatico de relays descubiertos por pubsub.
- Publicacion de providers de contenido y registros para que el routing de IPFS
  pueda encontrar el nodo que tiene el dato.
- Soporte para block brokers en conexiones limitadas por relay.

Este flujo de relay publico es distinto del relay privado por red. En la rama
actual, el caso de los logs usa `PIGEON_PRIVATE_RELAY_PORT_START/END` para
arrancar un relay protegido por PSK y publica un record privado cifrado en IPFS
publico para que otros peers de esa misma red puedan encontrarlo.

## Que no se porta

- Sincronizacion basada en Mongo.
- `NetworkSyncRequested` y consumidores asociados.
- Repositorios o proyecciones de estado antiguas que duplicaban el trabajo de
  OrbitDB.
- Runtimes que reintroduzcan una segunda fuente de verdad para la replicacion.

## Flujo esperado

1. El nodo que puede actuar como relay privado arranca su IPFS privado con
   `enableRelayServer`, la PSK de la red y un puerto publicado.
2. Ese nodo anuncia un multiaddr publico mediante `PIGEON_PUBLIC_HOST` y el
   puerto asignado por `PIGEON_PRIVATE_RELAY_PORT_START/END`.
3. `PrivateNetworkRelayRecordDirectory` cifra el record con la key privada de la
   red y lo publica en el IPFS publico mediante IPNS/routing/pubsub.
4. Otro nodo de la misma red privada abre su conexion publica de discovery,
   resuelve el record cifrado, lo descifra con la misma PSK y diale el multiaddr
   anunciado.
5. Al conectarse al relay privado, el nodo leaf escucha por `/p2p-circuit` y
   puede intercambiar IPFS, gossip y OrbitDB con peers de la misma red.
6. Cuando IPFS escribe contenido o registros, publica providers en routing.
7. OrbitDB y gossip se benefician de esos peers libp2p ya conectados, sin
   necesitar el flujo antiguo de Mongo.

## Variables relevantes

- `PIGEON_PUBLIC_HOST`: host anunciado para que otros nodos puedan dialear el
  relay. Debe resolver desde fuera del contenedor/host.
- `PIGEON_PRIVATE_RELAY_PORT_START` y `PIGEON_PRIVATE_RELAY_PORT_END`: rango de
  puertos para relays privados protegidos por PSK. Si solo hay una red privada,
  ambos pueden apuntar al mismo puerto.
- `PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS`: lista manual de multiaddrs de
  relays privados. Es un fallback operativo, no un requisito para el discovery
  automatico.
- `PIGEON_RELAY_RECORD_TTL_MS`: TTL de registros privados de relay.
- `PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS`: intervalo de refresco de
  discovery privado.
- `PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS`: intervalo de republicacion del
  record privado.
- `PIGEON_RELAY_ENABLED=true`: fuerza el arranque del relay publico heredado de
  la rama tmp. No sustituye el relay privado protegido por PSK.
- `PIGEON_RELAY_AUTO_ENABLE=true`: permite que un nodo con host publico arranque
  como relay publico si no conoce otro relay activo.
- `PIGEON_RELAY_PORT`: puerto publico del relay.
- `PIGEON_LIBP2P_PORT`: puerto libp2p publico opcional del nodo relay.
- `PIGEON_BOOTSTRAP_RELAY_MULTIADDRS`: lista separada por comas de relays
  conocidos para bootstrap.
- `PIGEON_RELAY_DISCOVERY_ENABLED=false`: desactiva el descubrimiento publico si
  se necesita aislar el nodo.
- `PIGEON_RELAY_RECORD_TTL_SECONDS`: TTL de registros publicos de relay.

## Checklist de despliegue

Para el caso del log, produccion necesita al menos:

```env
PIGEON_PUBLIC_HOST=teamspeak.futoineko.com
PIGEON_PRIVATE_RELAY_PORT_START=4181
PIGEON_PRIVATE_RELAY_PORT_END=4181
```

El puerto anunciado debe estar publicado por Docker y abierto en firewall/NAT.
En `docker-compose.yml` se publica el rango privado con:

```yaml
ports:
  - "8080:8080"
  - "${PIGEON_PRIVATE_RELAY_PORT_START:-4181}-${PIGEON_PRIVATE_RELAY_PORT_END:-4181}:${PIGEON_PRIVATE_RELAY_PORT_START:-4181}-${PIGEON_PRIVATE_RELAY_PORT_END:-4181}"
```

Validacion rapida desde una maquina externa:

```bash
node -e "const net=require('net'); const s=net.createConnection({host:'teamspeak.futoineko.com',port:4181,timeout:5000}); s.on('connect',()=>{console.log('CONNECT');s.end();}); s.on('timeout',()=>{console.log('TIMEOUT');s.destroy();}); s.on('error',(e)=>console.log(e.code));"
```

Debe imprimir `CONNECT`. Si imprime `ECONNREFUSED`, el problema es publicacion de
puerto/firewall, no OrbitDB ni `NetworkSyncRequested`.

## Criterio de funcionamiento

El cambio se considera correcto cuando un nodo sin conectividad directa puede:

- descubrir o recibir multiaddrs de relay;
- comprobar que el multiaddr anunciado acepta conexion TCP desde fuera;
- dialear el relay desde su libp2p privado;
- publicar providers de contenido y registros IPFS;
- recuperar contenido y registros a traves de peers/proveedores encontrados por
  routing;
- replicar OrbitDB y mantener gossip usando la conectividad libp2p resultante.

El e2e que valida este contrato es:

```bash
yarn test:e2e:real-transport:private-relay-discovery
```

Ese test levanta dos procesos Node separados, con storage y `process.env`
distintos. El proceso `leaf` no recibe el multiaddr del relay; solo recibe el
`peerId`, el CID/hash que debe poder leer tras discovery y la clave privada de
red compartida. La conexion al relay debe salir del record cifrado publicado en
IPFS publico. Antes de arrancar discovery verifica falsos positivos: el CID no
esta local, no se puede leer remotamente y gossip no llega.
