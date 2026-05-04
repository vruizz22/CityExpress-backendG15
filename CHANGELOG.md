# Changelog

All notable changes to CityExpress Backend G15 are documented here.

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
