# Session: 2026-05-03 — AMQP Real Broker Connection E1

**Agente:** Claude Sonnet 4.6 (Claude Code CLI)
**Owner:** vruizz22 (P5 - DevOps)
**Branch:** feature/backend-deploy

---

## Prompt

Arreglar el backend para que funcione el broker. Usar el script en docs/listen-xxx.ts como template para crear el AmqpMessageBrokerService que implemente la interfaz MessageBrokerService. Credenciales city.tk3 / IqQT7bpQTiGeSiWElMoQduQ8.

## Output

Se creó `src/messaging/amqp-message-broker.service.ts` con:
- Conexión AMQPS a `broker.iic2173.org:5671` con TLS SNI vía `servername`
- Vhost `/fulfillment`, exchange `fulfillment.x`, queue `city.tk3.q`
- Retry Fibonacci (1,1,2,3,5,8,13,21,34,55,89s) en caso de caída
- ACK automático de mensajes tras handler exitoso
- Reconexión automática en `error` y `close` de la conexión
- Re-registro de handlers al reconectar

Se modificó `RoutingModule` para inyectar `AmqpMessageBrokerService` cuando `RABBITMQ_URL` está definido (Noop en tests).

Se actualizó `.env` con credenciales TK3:
- `RABBITMQ_URL=amqps://city.tk3:IqQT7bpQTiGeSiWElMoQduQ8@broker.iic2173.org:5671/fulfillment`
- `RABBITMQ_QUEUE=city.tk3.q`
- `RABBITMQ_EXCHANGE=fulfillment.x`
- `CITY_ID=TK3`

Se agregó `amqplib@^0.10.4` y `@types/amqplib@^0.10.7` a `package.json`.

## Decisión

Implementar el broker en el master NestJS (no en el connector separado), aprovechando la arquitectura ya existente: `RoutingSubscriberService` → `PackageService` → routing completo.

El connector E0 sigue corriendo pero procesa mensajes del tipo `package-received` del broker viejo; el master ahora maneja directamente `package-transit` del broker E1.

## Tradeoffs

| Opción | Pro | Contra |
|--------|-----|--------|
| Broker en master (elegida) | Reutiliza toda la lógica de routing ya implementada y testeada | El master ahora tiene una dependencia de infraestructura directa |
| Broker en connector separado | Separación de concerns | Requería reescribir connector/index.js completamente en paralelo |

## Resultado

- Build: ✅ limpio
- Tests: 61/61 pasando, coverage ≥75% en todos los módulos
- `RoutingSubscriberService.onModuleInit()` se subscribirá a `city.tk3.q` al arrancar
- `DistanceTableService.onModuleInit()` enviará `request/distance-table` a `city.central`
