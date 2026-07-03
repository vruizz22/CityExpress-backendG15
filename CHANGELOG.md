# Changelog

All notable changes to CityExpress Backend G15 are documented here.

## [1.2.0] - 2026-07-02

Release acumulado E2 + E3 (el tag anterior cubría hasta la E1).

### E2 — Pagos, ruteo por criterio y workers

#### Features
- **auth**: guard JWT con Auth0 (RS256), roles y ownership por recurso
- **payments**: integración Webpay (create/commit), estados TRYING/SUCCESS/FAILED e idempotencia ante callbacks duplicados; mensaje `payment-status` a la central
- **shipments**: cotización, creación, historial y trigger del envío inicial post-pago (idempotente, `initial:<pkgId>`)
- **routes**: Dijkstra sobre la matriz de tablas recibidas; tablas calculadas persistidas y `GET /routes` servido desde BD
- **routing**: coordinación de tablas entre ciudades (RF06, anti-loop request→cost-update) + reenvío por criterio price/distance
- **jobs**: workers de cálculo de precio/rutas — BullMQ dual-mode + Lambda (Serverless v3, RNF06); `GET /heartbeat`
- **db**: modelos de pagos, envíos, jobs, tablas recibidas y rutas calculadas
- **ci/cd**: pipeline CodeDeploy a EC2 (RNF08), Actions pineadas a SHA y permisos least-privilege

#### Fixes
- **broker**: aceptar el formato real de la central (`body.routes`, `cost-update`, tablas sin `idpk`/`msgId`); routing keys y comparación de ciudades en minúscula (case-insensitive); master como único consumidor
- **broker/prod**: anti-tormenta — throttle de fanout/respuestas, logging compacto, dedup por `msgId`
- **prod**: OOM del master corregidos (flood de DEBUG logging; drenado del backlog `pending-route` en lotes keyset con single-flight y throttle)
- **routes**: `/routes` arma desde `CITY_CATALOG` y persiste la tabla de distancias en BD
- **cd**: timeout AfterInstall 900s, imagen slim del jobs-service (multi-stage), envs Auth0/RabbitMQ en prod
- **quality**: hotspots y vulnerabilidades SonarCloud

### E3 — Suscripciones, prioridad, seguros y feed en vivo

#### Features
- **subscriptions**: CRUD + motor de envíos periódicos con AWS Step Functions (StartExecution idempotente `name=subscriptionId`, loop DispatchTick→SQS waitForTaskToken→Lambda→tick), ledger de budget (RF01)
- **infra**: IaC Terraform Cloud (adopción de infra legacy, drift 0) + hardening Prowler como código (RNF02/RNF03)
- **pricing**: factor de prioridad (low 0.5 / medium 1 / high 2.5) y prima de seguro 5% en el precio (RF02/RF03)
- **messaging**: `package-transit` publicado con prioridad AMQP según `priorityClass` (low=1, medium=2, high=3) en creación, redirección y buffer offline (RF03) — #63
- **routing**: seguros — `metaContent: {insured: true}` interoperable (objeto/string), notificación `package-status: expired` con `reason` a la ciudad origen y cobro del seguro idempotente (claims `pkg-status:<id>` / `insurance:<id>`, estado `expired-insured`) (RF02) — #64
- **events**: feed SSE en vivo `GET /events/stream` + `/events/recent` con `package-created`, `package-received`, `package-redirected`, `insurance-charged`; schema alineado al front (RF04)
- **docs**: OpenAPI de los endpoints expuestos al front (RDOC02) — #62

#### Docs
- **architecture**: UML de componentes E3 (`arquitectura.drawio` + `architecture.md §10`) — motor de suscripciones, priority queues (supuesto lado productor), flujo de seguros, SSE y observabilidad (RDOC01) — #65
- **prompts**: AI-logs de todas las sesiones E2/E3 (integridad académica)

## [1.1.0] - 2026-05-04

### Features
- **messaging/amqp**: implement AMQP message broker service with connection handling and message consumption
- **routing**: implement dynamic message broker provider based on RabbitMQ URL
- **routing**: add connection handling for AMQP in DistanceTableService
- **packages**: integrate AuditService for package delivery reporting
- **packages**: add RoutingModule to PackagesModule imports
- **docker**: add RabbitMQ environment variables to master service
- **docker/prod**: add RabbitMQ exchange and city ID env vars to connector service
- **tests**: integrate AuditService into PackagesService tests
- **docs**: add AMQP broker connection documentation and service implementation details

### Fixes
- **messaging**: use namespace import for amqplib to avoid undefined at runtime (esModuleInterop issue)
- **docker/prod**: pass RabbitMQ and CITY_ID env vars to master service for EC2 deployment
- **app**: update greeting message to reflect correct API name
- **tests**: update welcome banner in AppController test
- add missing amqplib and @types/amqplib dependencies
- RF02 route persistence fix

### Refactors
- **docker-compose**: disable connector service as AMQP broker is handled by master
- **amqp**: improve code formatting and enhance connection handling

### Docs
- **README**: update architecture section with UML formal image
- **drawio/arquitectura**: add formal UML diagram
- add deployment, monitoring, and auth-gateway guides for E1

## [1.0.0] - 2026-04-29

- Initial release — base API, Docker setup, CI pipeline, database schema.
