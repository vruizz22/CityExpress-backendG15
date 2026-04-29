# Changelog

  Todas las novedades relevantes de CityExpress Backend G15.
  Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · SemVer.

## [1.0.0] — 2026-04-29

  Primera entrega tagueada del backend (kickoff E0 + setup E1).

### Added

- Connector RabbitMQ + Master NestJS + Postgres en Docker Compose (E0).
- `GET /packages` con paginación y filtros (RF1-RF4 E0).
- BMAD docs: roadmap, milestones, requirements, architecture, prompts/.
- `.github/` con PR template y CI workflow alineados al stack NestJS.

### Changed

- Plan de milestones comprimido al deadline real 2026-05-03 (`docs/roadmap.md §4`).

### Fixed

- (pendiente M1) Hotfix `GET /packages/:id` para buscar por `packageId` en vez de `idpk`.
