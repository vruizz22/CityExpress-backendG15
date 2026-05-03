# Session: 2026-05-01 — E1 Infra Plan (Persona 5)

**Agente:** Claude Opus 4.7 (Claude Code CLI)
**Owner:** Guillermo Carey (`Guillo2002`, guillocareym@gmail.com)
**Branch:** `feature/backend-deploy`
**Fecha:** 2026-05-01
**Plan referenciado:** `plan.md` (raíz del repo)

---

## Prompt

> Actúa como un Arquitecto de Software Senior especializado en infraestructura cloud
> (AWS), CI/CD y entregas académicas. Vas a producir un plan de trabajo para
> "Persona 5" (DevOps/Infra/Auth/Monitoring/Docs) de la Entrega 1 (E1) de
> CityExpress sobre este repositorio backend NestJS.
>
> NO escribas código de aplicación. Esto es un plan, no implementación. Solo se te
> permite editar `plan.md` (raíz) y crear un archivo nuevo en `docs/prompts/`.
>
> ================================================================================
> FASE 0 — LECTURA OBLIGATORIA ANTES DE PLANIFICAR
> ================================================================================
>
> Lee y razona explícitamente sobre:
>
> 1. Enunciado E1: `docs/2026-1 _ IIC2173 - E1 _ CityExpress.pdf`
> 2. Enunciado E0: `docs/IIC2173-E0-2026-1.pdf`
> 3. Ayudantías: `docs/AY01 - Intro a Cloud.pdf`, `docs/AY02 - Docker & Docker-Compose.pdf`, `docs/AY03 - DNS; Nginx y Deployment.pdf`
> 4. Resúmenes EC2 y Budget Alerts en `docs/`
> 5. Documentos del compañero arquitecto en E1: `docs/architecture.md`, `docs/roadmap.md`, `docs/milestones.md`, `docs/requirements.md`
> 6. Precedente de prompt agéntico: `docs/prompts/2026-04-27-e1-kickoff.md` (úsalo como REFERENCIA DE FORMATO para la FASE 3 de este prompt)
> 7. Estado actual del backend: `docker-compose.yml`, `Dockerfile`, `connector/Dockerfile`, `connector/index.js`, `connector/package.json`, `.example.env`, `prisma/schema.prisma`, `src/packages/**`, `package.json`, `README.md`
>
> Durante la lectura, anota mentalmente qué decisiones del plan anterior (que será
> borrado manualmente por mí antes de que ejecutes este prompt) eran erróneas. NO
> asumas que mi plan previo era correcto.
>
> ================================================================================
> FASE 1 — CONTEXTO DEL OWNER Y DECISIONES YA TOMADAS
> ================================================================================
>
> Soy Persona 5 en un equipo de 5:
>
>   P1 — Backend mensajería/broker: connector RabbitMQ, package-transit,
>        ACK/NACK, distance-table, retry Fibonacci. NO ES MI ROL.
>   P2 — Backend lógica de ruteo: maxHops, redirección, persistencia de
>        pendientes, última acción. NO ES MI ROL.
>   P3 — Backend/API/DB: modelos, endpoints JSON, idempotencia, tests. NO ES MI ROL.
>   P4 — Frontend SPA React+Vite+JS, vistas RF01/RF02/RF04. NO ES MI ROL.
>   P5 — DevOps/AWS/Auth/Monitoring/Docs (YO).
>
> Branch actual: `feature/backend-deploy` (ya creada, working tree con `plan.md`
> nuevo a generar).
>
> Dominio: `andresitowan.com` (asumir Route53 hosted zone disponible — si no, el
> plan debe describir cómo crearla).
>
> Cuenta AWS: reusada, Free Tier vigente. Budget objetivo: USD 12/mes con alertas
> al 50/80/100%.
>
> Frontend coordinado:
>   - Repo: `CityExpress-frontendG15` (separado).
>   - Stack: React + Vite + JS puro.
>   - Auth: dependencia `@auth0/auth0-react` ya en package.json, pero
>     Auth0Provider AÚN NO está montado en `src/main.jsx`. El httpClient ya está
>     preparado para recibir `getAccessTokenSilently` y agregar
>     `Authorization: Bearer ...` al fetch.
>   - El plan debe definir el contrato Auth0/CORS que P5 le pasa a P4.
>
> Decisiones ya tomadas — NO LAS CUESTIONES, INCORPÓRALAS:
>
>   D1. Auth0 (no Cognito).
>   D2. API Gateway tipo HTTP API (no REST + Custom Lambda Authorizer), con JWT
>       authorizer nativo.
>   D3. NGINX corre en host EC2 (no en container). Reverse proxy + TLS.
>   D4. Endurecimiento del origen via SHARED SECRET HTTP HEADER inyectado por
>       API Gateway en cada request y validado por NGINX antes de proxiear al
>       master. NO usar VPC Link / private integration en E1.
>   D5. Asignar Elastic IP a la EC2 antes del DNS.
>   D6. Certificado ACM para API Gateway custom domain debe vivir en `us-east-1`
>       (edge-optimized). Certificado de NGINX viene de Let's Encrypt/Certbot.
>   D7. Convención única de tags Docker:
>         cityexpress-master:<git-sha>
>         cityexpress-connector:<git-sha>
>       Alias `:latest` SOLO en `develop`. Producción jamás usa `:latest`.
>   D8. Budget USD 12 con alertas 50/80/100%.
>   D9. New Relic se carga vía `NODE_OPTIONS=-r newrelic` puesto en el environment
>       del servicio master en docker-compose.prod.yml. NO modificar el CMD del
>       Dockerfile. Variables: NEW_RELIC_LICENSE_KEY, NEW_RELIC_APP_NAME,
>       NEW_RELIC_NO_CONFIG_FILE=true.
>   D10. Connector debe ganar `pnpm-lock.yaml` y usar `pnpm install
>        --frozen-lockfile` para builds reproducibles.
>   D11. Esta E1 NO es programación agéntica completa con BMAD/coverage 75%. Solo
>        uso Claude Code para planificación. El plan debe incluir un disclaimer
>        breve y NO planificar trabajo de coverage 75% ni notificación formal de
>        agentic programming al ayudante para esta entrega.
>   D12. DB sigue en compose con volumen Docker (no RDS). El plan debe asumir el
>        riesgo y documentar cómo hacer un dump como mitigación mínima.
>
> Bug conocido a corregir en `.example.env`:
>   La línea
>     `DATABASE_URL="postgresql://${POSTGRES_USER}:..."`
>   no se interpola cuando `.env` la lee directo (Compose no resuelve `${}` dentro
>   de valores en archivos `.env`). El plan debe documentar la solución (quitar la
>   línea de `.env`, dejar que compose la construya inline en el servicio master,
>   o hardcodearla expandida en `.env`).
>
> Variables faltantes en `.example.env`:
>   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB deben aparecer como placeholders
>   explícitos.
>
> ================================================================================
> FASE 2 — GENERA `plan.md` (ESPAÑOL)
> ================================================================================
>
> Estructura mínima requerida (puedes agregar secciones, no quitar):
>
>   0. Decisión de Git y flujo feature/backend-deploy → develop → main.
>   1. Alcance de Persona 5 vs lo que hacen P1–P4. Tabla explícita.
>   2. Contratos hacia el equipo (P1, P2/P3, P4) con TODOs explícitos.
>   3. Higiene previa: estado limpio, ausencia de secretos, baseline local.
>   4. Docker y docker-compose: auditoría, dev, prod, tags, verificación.
>   5. ECR y deploy backend: repos, IAM, build/push, EC2 pull, rollback.
>   6. EC2 + Elastic IP + DNS + HTTPS: budget previo, EC2, EIP, Route53, NGINX, Certbot, smoke.
>   7. API Gateway HTTP API + Auth0: API, custom domain, integración, rutas, CORS, JWT, pruebas.
>   8. S3 + CloudFront para frontend: bucket+OAC, ACM us-east-1, vars a P4, CF transitorio.
>   9. New Relic: master, connector, infra, evidencia.
>   10. Budget Alerts.
>   11. Resiliencia (RNF10).
>   12. Carpeta /docs.
>   13. Orden de ejecución día a día.
>   14. Checklist de PR.
>   15. Riesgos y mitigaciones.
>   16. Disclaimer breve sobre uso de Claude Code para planificación únicamente (D11).
>   17. Información pendiente (TODOs).
>   18. Referencias oficiales.
>
> REGLAS DE ESCRITURA:
>   - Español en explicaciones; inglés en comandos/código.
>   - Sin emojis salvo que se pidan.
>   - Comandos copy-paste reales con `andresitowan.com`, no placeholders.
>   - YAML completo cuando muestres docker-compose.prod.yml.
>   - Snippet NGINX completo, no pseudocódigo.
>   - Sin secretos, sin tokens, sin license keys.
>   - Marcar TODOs claramente cuando dependa de otra persona.
>   - Cada sección termina con un "Criterio de salida" verificable.
>
> ================================================================================
> FASE 3 — AI USAGE LOG
> ================================================================================
>
> Crea `docs/prompts/2026-05-01-e1-infra-plan.md` siguiendo el formato del archivo
> `docs/prompts/2026-04-27-e1-kickoff.md`. Debe contener:
>   - Header con agente, owner, branch, fecha, plan referenciado.
>   - Sección "Prompt": pega este prompt completo.
>   - Sección "Output": archivos creados/modificados + investigación.
>   - Sección "Decisión": decisiones clave durante la escritura del plan.
>   - Sección "Tradeoffs": para cada decisión no obvia, alternativa rechazada y
>     por qué.
>
> ================================================================================
> FASE 4 — CIERRE
> ================================================================================
>
> Al terminar:
>   1. Muestra el ÍNDICE del nuevo plan.md.
>   2. Lista los TODOs que quedaron abiertos.
>   3. Pide AUTORIZACIÓN explícita antes de cualquier acción de implementación.
>
> PROHIBIDO:
>   - Editar archivos fuera de `plan.md` y el nuevo en `docs/prompts/`.
>   - Hacer git commit / git push.
>   - Crear recursos AWS.
>   - Proponer programación agéntica con BMAD/coverage 75% (D11).
>   - Proponer VPC Link / private integration (D4).
>   - Proponer RDS (D12).
>   - Inventar nombres de queues o endpoints que P1/P3 no han confirmado: usar
>     TODOs explícitos.

---

## Output

### Investigación previa (lecturas de referencia)

- `docs/architecture.md` (stub) — NFRs priorizados, estilos arquitectónicos elegidos,
  Mermaid de componentes y diagrama de secuencia. Sirve para alinear el diagrama de
  despliegue P5 (RDOC01) con el de componentes que producirán P1/P2/P3.
- `docs/roadmap.md` — confirma deadline **dom 2026-05-03 23:59 CLT** y feriado en
  Chile el viernes 1/05; condiciona el orden de ejecución (§13).
- `docs/milestones.md` — DoR/DoD, Gitflow, PR template (replicado en §14), penalizaciones,
  política IA.
- `docs/requirements.md` — tabla maestra E0/E1 + schema mensajes + tabla distancias +
  ACK/NACK; confirma que el connector E1 usará `city.<code>.q` y exchange `fulfillment.x`,
  pero el `<code>` exacto queda como TODO P1.
- `docs/prompts/2026-04-27-e1-kickoff.md` — usado como plantilla de formato.
- Estado actual del repo:
  - `docker-compose.yml`: `restart: always`, container names con prefijo `quackpackage_`,
    DB con puerto `5433:5432` expuesto, master con `DATABASE_URL` construido inline.
  - `Dockerfile`: multi-stage builder/runtime, `pnpm install --frozen-lockfile`, `CMD`
    correr `prisma migrate deploy && start:prod` (no se modifica por D9).
  - `connector/Dockerfile`: `pnpm install` **sin** `--frozen-lockfile` (D10 lo arregla),
    no copia lockfile (no existe).
  - `connector/index.js`: aún consume `observer.XX.q` y `package-received` (estado E0;
    P1 reescribe en su PR).
  - `connector/package.json`: solo `amqplib` y `axios`; sin `newrelic`.
  - `.example.env`: bug confirmado en línea 12 (`${POSTGRES_USER}` no se expande dentro
    del propio `.env`); falta `POSTGRES_USER/PASSWORD/DB` como placeholders.
  - `prisma/schema.prisma`: solo `PackageEvent`; ni `Route` ni `AuditEvent` aún (M2).
  - `src/packages/`: controller con `GET /`, `GET /:id`, `POST /`. Sin `/routes` ni
    `/packages/:id/deliver` aún → quedan como TODOs en §2.2.
  - `package.json` master: scripts NestJS estándar; **no tiene `newrelic`** → TODO P3.
- Git: branch actual `feature/backend-deploy`, último commit `a020df2` (merge release
  v1.0.0 a develop). Working tree: solo `plan.md` untracked.

Lecturas no realizadas en disco (PDFs binarios). El contenido relevante está
extraído en los `.md` del compañero (roadmap/requirements/milestones), que ya
referencian E0/E1/AY01-03 y los resúmenes de EC2 y Budget. No se reabrió el PDF
porque la información canónica para este plan ya estaba sintetizada y firmada por
el owner del repo.

### Archivos creados / modificados

- `plan.md` (raíz) — creado: 19 secciones siguiendo la estructura del prompt + un
  disclaimer Claude Code (§16) + sección de notas finales (§19).
- `docs/prompts/2026-05-01-e1-infra-plan.md` — este archivo (log de la sesión).

### Archivos no tocados (intencional)

- `src/**`, `prisma/**`, `connector/index.js`, `Dockerfile`, `docker-compose.yml`,
  `.example.env`, `package.json`, `connector/package.json`, `README.md`,
  `docs/architecture.md`, `docs/roadmap.md`, `docs/requirements.md`,
  `docs/milestones.md`, `docs/CHANGELOG.md`. Cualquier cambio se hará en una fase
  de implementación posterior, con autorización explícita.

---

## Decisión

1. **Adoptar el shared-secret header `X-Origin-Auth` validado en NGINX** como única
   barrera entre Internet y el master. API Gateway lo inyecta vía Parameter Mapping
   (Append header). NGINX lo compara con un `map` y devuelve 403 si no coincide
   (§6.5 + §7.3).
2. **Separar `docker-compose.yml` (dev, build local) de `docker-compose.prod.yml`
   (imágenes ECR, sin puerto DB expuesto, NGINX delante).** El dev queda casi como
   está; sólo se cambia `restart: always` → `unless-stopped` y los `container_name`
   al prefijo `cityexpress_*`.
3. **`NODE_OPTIONS=-r newrelic` exclusivamente vía environment de Compose**, no en
   Dockerfile. Implica que el master debe tener `newrelic` en deps (TODO P3, no P5).
4. **Health en `GET /` queda público** (NGINX expone `/healthz` pasando a `/` sin
   chequear secret) para permitir smoke tests externos sin filtrar el secret.
5. **Tres dominios separados:**
   - `app.andresitowan.com` → CloudFront (frontend).
   - `api.andresitowan.com` → API Gateway custom domain (público autenticado).
   - `origin-api.andresitowan.com` → EC2 directo (sólo accesible con secret).
   Esto permite romper la cadena rápidamente si algo falla (rotar el secret, cambiar
   DNS) sin tocar Auth0/CloudFront.
6. **No tocar el código del master/connector en este PR.** El único cambio de código
   que P5 podría introducir si P3 no avanza es agregar `newrelic` a `dependencies`;
   se documenta como mitigación, no como acción default.
7. **TODOs explícitos sobre nombres no confirmados** (queues, código de ciudad,
   `/routes` vs `/cities`, `POST` vs `PATCH` para deliver). El plan no inventa.
8. **Buffer del domingo 03/05 reservado para fixes y demo prep**, no para deploys
   nuevos. Coherente con feriado del viernes y el riesgo de incidentes en CORS/ACM.
9. **DB queda en volumen Docker (D12).** Mitigación: `pg_dump` manual antes de cada
   deploy mayor + backup diario en `/opt/cityexpress/backups/`.
10. **PR template y reviewer único a `develop`** (no a `main`). El merge a `main`
    queda en manos del lead arquitecto cuando todo el equipo cierre sus PRs.

---

## Tradeoffs

### Shared-secret header en NGINX vs VPC Link / IP allowlist en SG

- **Rechazado VPC Link:** D4 lo prohíbe explícitamente para E1; agrega VPC privada,
  NLB, complejidad de red que no caben en 3 días.
- **Rechazado IP allowlist en SG por rangos de API Gateway:** AWS publica los CIDRs
  pero cambian; rebote del 50% de tráfico productivo en cada cambio sería inaceptable.
- **Elegido shared secret:** trivial de implementar, fácil de rotar (regenerar +
  redeploy NGINX + actualizar parameter mapping), comparte modelo con muchos lab
  setups. Costo: si se filtra el secret, hay que rotar; aceptable para E1.

### Health endpoint público vs JWT

- Si `GET /` requiere JWT, los smoke tests automáticos necesitan token Auth0 →
  fricción para ayudante/CI. Y un health no expone datos.
- Riesgo de DoS sobre `/` mitigado por NGINX (`proxy_read_timeout 30s`) y por la
  rate limit default de API Gateway.

### `docker-compose.prod.yml` separado vs `override`

- **Rechazado `docker-compose.override.yml`:** Compose lo carga automáticamente en
  dev y P5/P3 podrían pisar variables sin querer en local.
- **Elegido archivo prod explícito:** se invoca con `-f docker-compose.prod.yml`,
  sólo en EC2. Cero ambigüedad.

### `NODE_OPTIONS=-r newrelic` vs editar el `CMD` del Dockerfile

- D9 obliga a no tocar Dockerfile. Beneficio adicional: agente New Relic encendido/
  apagado por entorno (no cargado en dev), sin imagen separada por entorno.

### Bucket SPA con OAC vs bucket público

- OAC + CloudFront es lo único compatible con S3 público bloqueado y firma de origen
  moderna. La alternativa (bucket público + website hosting) ahorra setup pero
  expone listing/objetos sin TLS de borde. No es opción en E1 porque RNF08 exige
  CloudFront.

### Connector `pnpm-lock.yaml` ahora vs después

- Ahora: build determinista en ECR; el riesgo es que P1 reescribe `connector/index.js`
  en M2 y agrega deps → invalida el lockfile generado hoy.
- Después: cada PR de connector regenera lockfile justo antes del push.
- **Solución:** P5 prepara la generación + cambio de Dockerfile pero **espera** a
  P1 para mergear. Coordinación explícita en §17.

### `restart: unless-stopped` vs `always`

- `always` reinicia incluso después de un `docker stop` manual. En Producción real
  eso no es deseable cuando se hace mantenimiento. `unless-stopped` respeta el stop
  manual y reinicia tras crash o reboot. Mejor para nuestros runbooks.

### Tres subdominios vs uno solo

- Un único `api.andresitowan.com` apuntando directo a la EIP rompería el modelo
  D4 (no podríamos validar el secret porque cualquier petición a ese dominio
  vendría tanto del Gateway como de Internet). Tres subdominios mantienen el
  modelo claro y permiten apagar el origen del Gateway sin rotar dominios.

### Plan B Cognito como riesgo, no como decisión

- D1 fija Auth0. Igual se documenta como riesgo en §15 porque la cuenta Auth0
  free podría dar problemas. La mitigación real es verificar el tenant temprano
  (jueves 22:00 según §13).

### No proponer GitHub Actions CI/CD en E1

- El plan podría incluir un workflow `.github/workflows/deploy.yml` para
  build/push/ssh-deploy. Lo descarté porque (a) D11 limita el scope, (b) tres días
  no son suficientes para iterar el workflow, (c) los comandos manuales del §5.3
  bastan para la entrega. Se deja como mejora para E2.
