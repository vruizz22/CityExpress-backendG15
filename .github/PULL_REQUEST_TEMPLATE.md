## Resumen

<2-3 líneas explicando qué cambia y por qué.>

## Cambios

- archivo:línea — qué cambió
- ...

## Cómo funciona

<diagrama mental: input → procesamiento → output, qué módulos toca>

## Cómo se verificó

- [ ] `pnpm run build`
- [ ] `pnpm run lint`
- [ ] `pnpm run test:cov` (coverage del módulo: \_\_%)
- [ ] `pnpm run test:e2e` (si aplica)
- [ ] Migración Prisma corre sin errores (`pnpm exec prisma migrate dev`) — si aplica
- [ ] Smoke test manual: <pasos contra dev / staging>
- [ ] Smoke test contra EC2 con HTTPS — si afecta deploy
- [ ] Render markdown ok — si tocaste docs

## AI usage

- [ ] Sesión registrada en `docs/prompts/YYYY-MM-DD-<tema>.md`
- Link: ...

## Trazabilidad

- Cierra: RF/RNF/RDOC \_\_
- Issue: #\_\_ (si aplica)
- Milestone: M\_\_
