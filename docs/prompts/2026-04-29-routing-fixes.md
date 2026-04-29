# Session: 2026-04-29 — M3 routing fixes
**Agente:** GPT-5.2-Codex (Copilot CLI)
**Owner:** G15
**Branch:** feature/m3-routing-fixes (pendiente)

## Prompt
Aplicar correcciones de compliance: suscripción a `distance-table`, wiring de ruteo al broker, persistencia antes de ACK, guardar `senderCityId` en pendientes, validación formal de DTOs y remover `package-lock.json`, respetando restricciones de no usar `any`.

## Output
- Listener para `package-transit` y `distance-table` usando `MessageBrokerService`.
- Validación con Zod para mensajes y DTOs.
- Persistencia de eventos antes de ACK, con detección de duplicados.
- Persistencia de `senderCityId` para redirecciones pendientes.
- `.gitignore` actualizado y `package-lock.json` eliminado.

## Decisión
1. Introducir Zod para validación tipada en DTOs y mensajes de broker.
2. Persistir evento inbound en `PackageEvent` antes de ACK para cumplir disponibilidad.
3. Guardar `senderCityId` como columna opcional en `PackageEvent` para evitar loops.

## Tradeoffs
- Agregar Zod incrementa dependencia, pero estandariza validación requerida por arquitectura.
- Persistir antes de ACK agrega una escritura adicional por mensaje, a cambio de resiliencia.
- Columna `senderCityId` añade complejidad al esquema, pero evita redirecciones erróneas.
