# Spike: IPFS privado, PSK, relay y sincronizacion

Fecha: 2026-06-09.

## Contexto

Objetivo: un nodo debe poder leer CIDs alojados por otro nodo de la misma red privada IPFS, incluso cuando alguno este detras de NAT.

CID de referencia:

- Root CID: `bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i`
- Hoja raw que falla: `bafkreiga7qjmkxahmlgsh2efpuoxepkf7qkc2ucjipd4cxscghpflo3joq`
- Red privada: `ee33cc83-2cf1-40c0-968c-1aae69e38ae7` (`Alpha network`)
- Peer produccion: `12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi`
- Peer localhost: `12D3KooWDHwUoxY5MSJaTP66sbsMCFZEQwVVHS5EtemUrxtFqNGp`

## Pruebas realizadas

### 1. El CID existe en produccion

Hipotesis: el CID no existe o no esta en produccion.

Prueba:

- `https://pigeon.futoineko.com/api/ipfs/bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i`
- Resultado: `200`, `image/gif`, ~9 MB.
- `https://pigeon.futoineko.com/api/ipfs/bafkreiga7qjmkxahmlgsh2efpuoxepkf7qkc2ucjipd4cxscghpflo3joq`
- Resultado: `200`, `application/octet-stream`, `1048576` bytes.

Conclusion: no es un CID inexistente. Produccion lo puede servir por su API.

### 2. Localhost ve a produccion como peer privado

Hipotesis: localhost no ve peers de la red privada.

Prueba:

- `GET http://localhost:8080/node/network/debug`
- Resultado observado: red privada `Alpha network`, `peerCount=1`, `connectionCount=1`.
- Conexion observada: `/dns4/teamspeak.futoineko.com/tcp/4001/p2p/12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi`.

Conclusion: hay conexion libp2p privada hacia produccion. Esto no garantiza que Bitswap pueda traer bloques.

### 3. La conexion actual no usa circuit relay

Hipotesis: IPFS privado esta usando el relay publico para llegar a produccion.

Prueba de codigo:

- `PublicRelayRuntime.buildRelayRecord()` publica:
  - `relayMultiaddrs`: direccion del relay, normalmente puerto `4011`.
  - `privateIpfsMultiaddrs`: direccion directa del IPFS privado, normalmente puerto `4001`.
- `HeliaIPFS.dialPublicRelayRecord()` usa `privateIpfsMultiaddrsFrom(record)`.
- La conexion debug muestra `tcp/4001`, no `/p2p-circuit`.

Conclusion: actualmente el IPFS privado dialea el multiaddr directo del peer (`4001`). No esta construyendo ni dialando una ruta tipo:

```text
/dns4/<host>/tcp/<relayPort>/p2p/<relayPeerId>/p2p-circuit/p2p/<targetPeerId>
```

Por tanto, tener relay activo no implica que el trafico IPFS privado este pasando por relay.

### 4. PSK compartida no basta

Hipotesis: con la misma pre-shared key, Helia/IPFS descubre y conecta automaticamente.

Prueba:

- Se han visto peers en `/peers` y `/node/network/debug`.
- Aun asi, el root CID falla en localhost.
- El log de fetch muestra:

```text
IPFS content retrieval progress: cid="bafkreiga7qjmkxahmlgsh2efpuoxepkf7qkc2ucjipd4cxscghpflo3joq" networkName="Alpha network" networkType="private" event="bitswap:found-provider" provider="12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi" routing="manual"
```

Pero no aparece `bitswap:block`.

Conclusion: PSK permite filtrar/conectar peers autorizados, pero no sustituye a tener un multiaddr dialable ni garantiza transferencia Bitswap.

### 5. No parece un problema de API/public JSON race

Hipotesis: el endpoint `/ipfs/:cid` estaba compitiendo bytes vs JSON y podia fallar por la rama equivocada.

Prueba/cambio:

- Se cambio `GetIPFSContentRoute` para usar metadata de replicacion:
  - si el CID esta registrado como binario, solo intenta bytes;
  - si esta registrado como JSON, solo intenta JSON;
  - sin metadata conserva fallback antiguo.

Resultado:

- El root CID sigue fallando en localhost.

Conclusion: no es el race bytes/json.

### 6. No parece solo un limite de tamano de respuesta HTTP

Hipotesis: la API local no puede devolver binarios grandes.

Prueba:

- Produccion devuelve la hoja raw de `1 MiB` por HTTP sin problema.
- Localhost falla antes de tener bytes.
- El error se produce en IPFS/Bitswap:

```text
LoadBlockFailedError: Failed to load block for bafkreiga7qjmkxahmlgsh2efpuoxepkf7qkc2ucjipd4cxscghpflo3joq
```

Conclusion: el problema esta antes de Express/HTTP response.

### 7. Ajustar Bitswap no resolvio el problema

Hipotesis: el default `maxSizeReplaceHasWithBlock=1024` hacia que bloques grandes no se enviaran inline y fallaba el paso HAVE -> WANT_BLOCK.

Prueba/cambio:

- Se aumento para IPFS privado:
  - `maxSizeReplaceHasWithBlock = 4 MiB`
  - `maxIncomingMessageSize = 8 MiB`
  - `maxOutgoingMessageSize = 8 MiB`
  - timeouts internos Bitswap a `60s`

Resultado:

- Localhost sigue encontrando provider privado.
- No recibe `bitswap:block`.
- Sigue fallando el bloque raw.

Conclusion: puede ayudar como hardening, pero no explica por si solo el fallo actual.

### 8. Timeout de busqueda IPFS

Problema: un CID no servible podia bloquear demasiado tiempo.

Cambio:

- `IPFS_CONTENT_BYTES_TIMEOUT_MS` default bajado de `120000` a `10000`.
- `ROUTING_RECORD_TIMEOUT_MS` bajado de `15000` a `10000`.

Resultado:

- La hoja raw fallida responde `404` en ~10s en localhost.

Conclusion: el timeout ahora es razonable para busqueda/proveedor fallido. Si hay transferencia real de bytes, habra que diferenciar busqueda vs streaming para no cortar descargas legitimas grandes.

## Hipotesis actual

El sistema tiene relay server publico, pero el IPFS privado no esta usando relay/circuit relay para alcanzar peers. Esta usando multiaddrs directos (`tcp/4001`). Eso puede funcionar solo si el peer destino es dialable directamente.

Para NAT o conexiones inestables, falta al menos una de estas piezas:

1. Construir multiaddrs `/p2p-circuit` a partir de `relayMultiaddrs`.
2. Asegurar que los nodos leaf hacen reserva en el relay si necesitan ser alcanzables a traves de el.
3. Distinguir en debug:
   - conexion directa `tcp/4001`;
   - conexion por relay `/p2p-circuit`;
   - stream Bitswap abierto;
   - bloque raw pequeno OK;
   - bloque raw grande OK.
4. No marcar `privateIpfsAvailable=true` como salud real de IPFS. Ahora solo significa "hay peer libp2p", no "Bitswap puede traer contenido".

## Siguientes pruebas recomendadas

### 9. Transporte cliente circuit relay

Hipotesis: private Helia no tenia `circuitRelayTransport()` como transporte cliente.

Prueba/cambio:

- Se intento anadir `circuitRelayTransport()` manualmente a los defaults de libp2p.
- Resultado al arrancar:

```text
InvalidParametersError: There is already a transport with the tag @libp2p/circuit-relay-v2-transport
```

Conclusion: Helia ya trae transporte cliente de circuit relay. El problema no es falta de `circuitRelayTransport()`.

### 10. Construccion de multiaddrs circuit

Hipotesis: aunque el transporte cliente existe, no se estaba construyendo ninguna direccion `/p2p-circuit`.

Prueba/cambio:

- `PublicRelayRecordRegistry` ahora puede derivar:

```text
/dns4/<host>/tcp/<relayPort>/p2p/<relayPeerId>/p2p-circuit/p2p/<targetPeerId>
```

- `HeliaIPFS.dialPublicRelayRecord()` usa directos + circuit fallback.
- `knownRelayProviderMultiaddrs()` tambien usa directos + circuit fallback.

Pendiente:

- Verificar en runtime si el dial circuit realmente conecta y si Bitswap usa esa ruta.

Resultado posterior:

- Tras construir direcciones circuit, el log local muestra dial correcto:

```text
Private network "Alpha network" connected to private IPFS relay record peerId="12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi" "/dns4/teamspeak.futoineko.com/tcp/4011/p2p/12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi/p2p-circuit/p2p/12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi"
```

- El mismo bloque raw sigue fallando:

```text
GET http://localhost:8080/ipfs/bafkreiga7qjmkxahmlgsh2efpuoxepkf7qkc2ucjipd4cxscghpflo3joq
=> 404 en ~10s
```

- Durante el fetch sigue apareciendo `bitswap:found-provider` para produccion, pero no aparece `bitswap:block`.

Conclusion: ahora si se prueba una ruta `/p2p-circuit`, pero el bloque no llega igualmente. La siguiente hipotesis es que el provider anunciado no esta entregando bloques raw grandes por Bitswap en esa red/runtime, o que el peer target/relay comparten PeerId en runtimes distintos y la ruta circuit no llega al runtime IPFS que tiene el blockstore.

## Siguientes pruebas recomendadas

1. Confirmar en produccion si el blockstore de la red privada `Alpha network` contiene la hoja raw directamente.
2. Confirmar si produccion recibe el WANT-BLOCK por Bitswap y si responde con bloque, HAVE o error.
3. Evitar compartir el mismo PeerId entre runtime relay publico y runtime IPFS privado si circuit relay no puede distinguirlos correctamente.
4. Si hay nodos leaf detras de NAT, implementar reservas relay reales para su runtime IPFS privado, no solo publicar el relay node.
5. Anadir endpoint/probe debug solo para owner o `DEBUG_NETWORK=true`:
   - `GET /node/network/debug/ipfs/probe?networkId=&cid=`
   - devolver provider encontrado, protocolo Bitswap, tiempo, error y si hubo bloque.

### 11. Lectura sin sesion Bitswap explicita

Hipotesis: la sesion creada con `blockstore.createSession(parsedCid, retrievalOptions)` puede limitar el wantlist o atascar la peticion en un provider/ruta concreta. Hay reports similares de Helia donde la recomendacion era probar sin sesion para que el wantlist se difunda a los peers conectados.

Prueba/cambio:

- `collectRawBlockBytes()` deja de crear una sesion explicita.
- `getBytes()` para UnixFS deja de pasar `{ blockstore: session }` a `unixfs`.
- Se mantienen `providers` y `onProgress` en las opciones, pero se usa el blockstore normal de Helia.

Pendiente:

- Ejecutar build/tests.
- Reiniciar localhost.
- Probar de nuevo:

```text
GET http://localhost:8080/ipfs/bafkreiga7qjmkxahmlgsh2efpuoxepkf7qkc2ucjipd4cxscghpflo3joq
GET http://localhost:8080/ipfs/bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i
```

Resultado:

- `yarn build`: PASS.
- Tests enfocados de relay/debug: PASS.
- Hoja raw en localhost: `404`, `application/json`, `40` bytes, ~`10.08s`.
- Root CID en localhost: `404`, `application/json`, `40` bytes, ~`10.02s`.

Conclusion: quitar la sesion explicita no resuelve el problema. La peticion sigue encontrando provider pero no recibe bloque.

### 12. PeerId reutilizado entre runtimes

Hipotesis: el relay publico y el IPFS privado comparten PeerId, de forma que libp2p no puede distinguir claramente entre "quiero hablar con el relay" y "quiero hablar con el runtime IPFS privado que tiene Bitswap/blockstore".

Prueba de codigo:

- `IPFSNetworkRegistry.loadOrCreateSharedPeerPrivateKey()` crea/persiste una sola clave en:

```text
<IPFS_STORAGE_PATH>/shared-peer-private-key.pb
```

- `IPFSNetworkRegistry.createNetworkFromConfig()` pasa esa misma `sharedPrivateKey` a:
  - `PrivateIPFS.create({ privateKey: sharedPrivateKey, ... })`
  - `PublicIPFS.create({ privateKey: sharedPrivateKey, ... })`

- `PublicRelayRuntime.start()` tambien arranca el relay con:

```text
this.networkRegistry.getSharedPeerPrivateKey()
```

- Los logs de produccion confirman que el relay publico y la red privada tienen el mismo PeerId:

```text
Started private network "Alpha network" with Peer ID: 12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi
Public relay runtime started peerId="12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi"
```

- El multiaddr circuit generado acaba siendo:

```text
/dns4/teamspeak.futoineko.com/tcp/4011/p2p/12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi/p2p-circuit/p2p/12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi
```

Conclusion: esta hipotesis queda confirmada. El relay y el target IPFS no deberian compartir PeerId. El record actual tampoco puede expresar correctamente `relayPeerId` vs `privateIpfsPeerId` porque solo tiene un `peerId` principal.

Fix recomendado, sin aplicar todavia:

1. Mantener claves libp2p persistentes separadas por runtime:
   - relay publico: `<IPFS_STORAGE_PATH>/public-relay-private-key.pb`
   - IPFS publico: clave propia o la actual compartida si se mantiene como "node public IPFS", pero no la del relay
   - IPFS privado: clave propia por red privada, por ejemplo `<IPFS_STORAGE_PATH>/<networkId>/peer-private-key.pb`
2. Cambiar el relay record a un contrato explicito:

```text
relayPeerId
relayMultiaddrs
privateIpfsPeerId
privateIpfsDirectMultiaddrs
privateIpfsCircuitMultiaddrs
```

3. Construir circuit multiaddrs como:

```text
/p2p/<relayPeerId>/p2p-circuit/p2p/<privateIpfsPeerId>
```

4. Asegurar reserva real del runtime IPFS privado cuando necesite ser alcanzable por relay:
   - escuchar `/p2p-circuit`
   - dialear relay
   - verificar que aparece una multiaddr circuit propia del IPFS privado
5. Solo despues considerar `privateIpfsAvailable=true`; ahora mismo "peer conectado" no significa "Bitswap puede traer contenido".

Cambio aplicado:

- `IPFSNetworkRegistry` deja de reutilizar la clave compartida para todos los runtimes.
- El relay publico usa una clave persistida independiente.
- La conexion publica auxiliar del directorio de relay usa una clave independiente.
- Cada red IPFS privada usa una clave persistida propia en la carpeta de esa red.
- El record publico del relay anuncia solo direcciones del relay.
- El record privado cifrado por red incluye `privateIpfsPeerId` y `privateIpfsMultiaddrs`.
- `PublicRelayRecordRegistry.privateIpfsRelayMultiaddrsFrom()` usa `privateIpfsPeerId || peerId` como target del circuit relay para mantener compatibilidad con records antiguos.

Verificacion local:

- Build: PASS.
- Tests enfocados de relay/debug: PASS.
- `GET /node/network/debug` en localhost muestra PeerId privado nuevo:

```text
private Alpha network peerId = 12D3KooWByD8qwfywJQFKcpzbWz7gaM8QAoZKYxpC9Mf21d1AsZr
connected peer = 12D3KooWK2Faa8nrsyDs4SsJvT64gsesBgNCNorgHWccaJVq6VDi
```

- El CID sigue fallando en localhost con `404` tras ~`10s`.

Conclusion:

- La colision local ya esta corregida.
- Esta prueba todavia no confirma el circuito completo porque produccion sigue publicando el record antiguo, donde relay e IPFS privado comparten PeerId. Hace falta actualizar produccion con este cambio para comprobar si el nuevo record queda como:

```text
/p2p/<relayPeerId>/p2p-circuit/p2p/<privateIpfsPeerId>
```

Riesgo pendiente:

- Aunque el record sea correcto, el target IPFS privado podria no estar haciendo reserva real en el relay si no escucha/dialea `/p2p-circuit`.

### 13. Configuracion fija de puerto eliminaba `/p2p-circuit`

Hipotesis: en produccion, al configurar `PIGEON_LIBP2P_PORT=4001`, el parser reemplaza `addresses.listen` por un unico listener TCP y elimina listeners por defecto como `/p2p-circuit`.

Prueba de codigo:

- `HeliaIPFSParser.configurePrivateNodeAddresses()` hacia:

```text
listen = ["/ip4/0.0.0.0/tcp/<port>"]
```

Conclusion: con puerto fijo, el runtime IPFS privado podia perder la capacidad de hacer reserva circuit relay.

Cambio aplicado:

- Mantener el puerto fijo configurado.
- Preservar listeners circuit existentes.
- Asegurar `"/p2p-circuit"` en `addresses.listen`.

Pendiente de verificar tras actualizar produccion:

- `GET /node/network/debug` en produccion debe mostrar PeerIds distintos:
  - public relay peer id
  - private Alpha network peer id
- El record privado cifrado debe generar fallback:

```text
/dns4/teamspeak.futoineko.com/tcp/4011/p2p/<relayPeerId>/p2p-circuit/p2p/<privateIpfsPeerId>
```

- La red privada debe exponer alguna multiaddr `/p2p-circuit/.../<privateIpfsPeerId>`.

### 14. Public IPFS anunciaba el puerto del relay con el PeerId equivocado

Hipotesis: al separar PeerIds, cualquier multiaddr que use el puerto del relay (`4011`) pero termine con el PeerId de otro runtime pasa a ser invalida.

Prueba de codigo:

- `HeliaIPFSParser.configurePublicRelayProviderAddresses()` anunciaba:

```text
/dns4/<host>/tcp/<relayPort>/p2p/<publicIpfsPeerId>
```

- Ese puerto lo escucha el runtime del relay, cuyo PeerId ahora es distinto.

Conclusion: esa direccion era solo aparentemente valida cuando todos los runtimes compartian PeerId. Con PeerIds separados, publicarla confunde discovery/dialing.

Cambio aplicado:

- Se elimina ese announce. Public IPFS conserva su configuracion normal de Helia/bootstrap.
- Las rutas por relay se publican solo mediante relay records explicitos.

Verificacion:

- Build: PASS.
- Tests enfocados de relay/debug: PASS.
- Root CID en localhost con produccion aun sin este cambio: `404` en ~`10.0s`.

Conclusion:

- El codigo local ya no publica multiaddrs imposibles.
- El CID no puede darse por resuelto hasta actualizar produccion, porque localhost sigue descubriendo records antiguos desde produccion/fallback cache.

### 15. Bitswap por circuit relay con PSK

Objetivo: comprobar fuera de la app si dos Helia/IPFS privados con carpetas distintas pueden transferir contenido usando un relay.

Spike: `tmp/ipfs-relay-psk-spike.mjs`.

Escenarios probados:

1. Relay publico sin PSK + peers publicos sin PSK.
2. Relay publico sin PSK + peers privados con PSK.
3. Relay con la misma PSK + peers privados con PSK.

Resultados:

- Un peer privado con PSK no puede usar directamente un relay sin PSK. El dial al relay falla con timeout/ECONNRESET.
- Un relay con la misma PSK permite crear circuitos privados, pero eso convierte al relay en especifico de esa red PSK.
- Escuchar solo `/p2p-circuit` no es suficiente de forma fiable en el spike. Cuando ya conocemos el relay, hay que escuchar en la direccion especifica:

```text
<relayMultiaddr>/p2p-circuit
```

- Bitswap abre `/ipfs/bitswap/1.2.0` sobre el circuito, pero `@helia/bitswap@3.1.3` pierde `runOnLimitedConnection` dentro de `Network.sendMessage()`. El error exacto era:

```text
LimitedConnectionError: Cannot open protocol stream on limited connection
```

- Tras parchear localmente ese punto, el requester manda WANT-BLOCK y el provider recibe el request.
- El provider no puede responder si el requester no tiene tambien una reserva/circuit address. El error exacto era:

```text
NoValidAddressesError: The dial request has no valid addresses
```

- Con provider y requester reservados en el mismo relay PSK, un bloque de `64 KiB` se transfiere correctamente.
- Un bloque de `1 MiB` seguia fallando hasta subir el limite del relay. `@libp2p/circuit-relay-v2` tiene por defecto:

```text
DEFAULT_DATA_LIMIT = 128 KiB
```

- Con `defaultDataLimit = 16 MiB`, el spike transfiere correctamente `64 KiB` y `1 MiB` por Bitswap session:

```text
small-single-block sessionFetchOk=true sessionFetchSize=65536
large-chunked sessionFetchOk=true sessionFetchSize=1048576
```

Conclusiones:

- El relay publico sin PSK no sirve para transportar IPFS privado PSK.
- Para redes privadas PSK hay que usar relays que participen en esa misma PSK o implementar otro transporte/proxy de aplicacion.
- Cada nodo que quiera intercambiar bloques por relay debe reservar en el relay; no basta con que solo lo haga el nodo que aloja el CID.
- Hay que elevar/configurar el `defaultDataLimit` del relay para media real.
- Hay que parchear o sustituir `@helia/bitswap` para que `sendMessage()` conserve `runOnLimitedConnection` en la cola.
