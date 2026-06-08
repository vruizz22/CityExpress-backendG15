# CI/CD — CityExpress G15 (RDOC04)

> Documenta los pipelines de integración y despliegue continuo: **RNF08** (backend → EC2 vía CodeDeploy) y **RNF09** (frontend → S3/CloudFront). No contiene secretos: solo nombres de variables.

---

## 1. Visión general

```text
push a main ─▶ GitHub Actions
                 │  job "quality" (reusa ci.yml: lint · test:cov · build)
                 ▼  (si verde)
              job "deploy"
                 │  build imagen Docker (amd64)
                 ▼
        ECR privado (cityexpress-master:<git-sha-7>)
                 │
                 ▼
        S3 (cityexpress-deploy-artifacts/master/<sha>.zip)   ← bundle CodeDeploy
                 │
                 ▼
        CodeDeploy (App cityexpress-backend / DG cityexpress-backend-dg)
                 │  appspec.yml + deploy/*.sh (en la EC2)
                 ▼
        EC2 i-0bfbc93f5e6340508
           ├─ pull imagen nueva desde ECR
           ├─ docker compose up -d  (migraciones Prisma corren en el CMD)
           └─ healthcheck en 127.0.0.1:3000
```

Decisiones de diseño (fundamentadas):

- **ECR privado, no público.** El privado ya estaba cableado y andando en E1 (repo `cityexpress-master`, instance profile con pull, `docker-compose.prod.yml` referenciando `${ECR_REGISTRY}`). Migrar a público era re-trabajo sin beneficio real.
- **CodeDeploy, no SSH.** El enunciado lo nombra explícitamente. El plan B (SSH con `appleboy/ssh-action`) queda documentado como alternativa, pero se priorizó CodeDeploy.
- **OIDC, no access keys.** GitHub asume un rol IAM por OpenID Connect: cero credenciales de larga vida en los secrets del repo.

---

## 2. Backend (RNF08)

### 2.1 Workflows

| Archivo | Trigger | Qué hace |
|---|---|---|
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | PR a `main`/`develop`, push a `develop`, **`workflow_call`** | Calidad: `pnpm install --frozen-lockfile`, `prisma generate`, `lint`, `test:cov`, `build`, sube coverage como artifact. |
| [.github/workflows/cd-backend.yml](../.github/workflows/cd-backend.yml) | push a `main`, `workflow_dispatch` | Reusa `ci.yml` como gate → build imagen → ECR → bundle a S3 → CodeDeploy → espera el resultado. |

`cd-backend.yml` reusa `ci.yml` (`uses: ./.github/workflows/ci.yml`) para no duplicar los pasos de calidad: si la calidad falla, **no se despliega**.

### 2.2 Pasos del job `deploy`

1. **Checkout** del commit.
2. **OIDC**: `aws-actions/configure-aws-credentials@v4` asume `vars.AWS_DEPLOY_ROLE_ARN` (`id-token: write`).
3. **Login a ECR** privado.
4. **Build & push**: `docker build --platform linux/amd64` → `cityexpress-master:<git-sha-7>` → `docker push`. Tag por SHA, nunca `latest`.
5. **Bundle**: escribe el SHA en `image_tag`, `chmod +x deploy/*.sh`, zipea `appspec.yml + docker-compose.prod.yml + deploy/ + image_tag`.
6. **Upload a S3**: `vars.DEPLOY_ARTIFACTS_BUCKET/master/<sha>.zip`.
7. **CodeDeploy**: `aws deploy create-deployment` (`--file-exists-behavior OVERWRITE`) y `aws deploy wait deployment-successful` (falla el workflow si el deploy falla).

### 2.3 Qué pasa en la EC2 (CodeDeploy)

[appspec.yml](../appspec.yml) define:

- **files**: copia `docker-compose.prod.yml` e `image_tag` a `/opt/cityexpress`. (El `.env` con secretos ya vive en la EC2 y **no** se toca.)
- **AfterInstall** → [deploy/pull_and_up.sh](../deploy/pull_and_up.sh): actualiza solo `IMAGE_TAG` en el `.env`, login a ECR con el instance profile, `docker compose pull && up -d`, `docker image prune -af`. Las **migraciones Prisma** corren solas en el `CMD` del contenedor (`pnpx prisma migrate deploy && start:prod`).
- **ValidateService** → [deploy/healthcheck.sh](../deploy/healthcheck.sh): falla (y dispara rollback de CodeDeploy) si el master no responde en `127.0.0.1:3000` tras ~90s.

### 2.4 Recursos AWS (one-time)

| Recurso | Nombre | Notas |
|---|---|---|
| Bucket S3 | `cityexpress-deploy-artifacts` | bundles de CodeDeploy |
| OIDC provider | `token.actions.githubusercontent.com` | federación GitHub→AWS |
| Rol GitHub | `github-actions-cityexpress` | trust al repo `vruizz22/CityExpress-backendG15`; perms: push ECR + `s3:PutObject` + `codedeploy:CreateDeployment/...` |
| Rol servicio CodeDeploy | `codedeploy-cityexpress` | managed `AWSCodeDeployRole` |
| Instance profile EC2 | (existente) | + `s3:GetObject` al bucket de bundles (pull ECR ya lo tenía) |
| Agente CodeDeploy | en la EC2 | `codedeploy-agent` (`active (running)`) |
| CodeDeploy App / DG | `cityexpress-backend` / `cityexpress-backend-dg` | DG apunta al tag `Name=cityexpress-ec2`, config `AllAtOnce` |

### 2.5 Variables en GitHub (Settings → Variables, no Secrets)

| Variable | Valor |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::353731341232:role/github-actions-cityexpress` |
| `DEPLOY_ARTIFACTS_BUCKET` | `cityexpress-deploy-artifacts` |

### 2.6 Verificación de un deploy

En la pestaña **Actions** → run de *CD Backend*: `quality` ✓ → `deploy` con `Deployment: d-XXXXXXXXX` → ✓.

En la EC2:
```bash
docker ps --format '{{.Image}}\t{{.Status}}'   # la imagen master debe tener el SHA nuevo
curl -i https://origin-api.andresitowan.com/healthz   # 200
```

### 2.7 Rollback

- **Manual rápido:** `workflow_dispatch` (botón *Run workflow*) sobre un commit/rama con el SHA bueno, **o** el procedimiento de [docs/deploy.md §14](deploy.md) (editar `IMAGE_TAG` en el `.env` de la EC2 + `compose pull && up -d`).
- **Automático:** si `ValidateService` (healthcheck) falla, CodeDeploy marca el deployment como fallido (configurable para auto-rollback en el Deployment Group).

> 📸 _Capturas pendientes:_ run verde de *CD Backend*, deployment `Succeeded` en la consola de CodeDeploy, `docker ps` con el SHA nuevo en la EC2.

---

## 3. Frontend (RNF09)

> ⏳ **Pendiente** — vive en el repo del front (`vruizz22/CityExpress-frontendG15`), no en este. Pipeline previsto (`.github/workflows/cd-frontend.yml`, trigger push a `main`):

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm build                       # vite → dist/
- run: aws s3 sync dist/ s3://cityexpress-frontend-andresitowan/ --delete
- run: aws cloudfront create-invalidation --distribution-id EYMIU0TNOQ7F9 --paths '/*'
```

Secrets/vars necesarios (sin valores): rol OIDC o keys con `s3:PutObject/DeleteObject` al bucket + `cloudfront:CreateInvalidation`; envs de build `VITE_*` (ver [docs/deploy.md §11](deploy.md)).

---

## 4. Resumen del flujo de ramas

- PR a `develop`/`main` → corre `ci.yml` (calidad).
- push a `develop` → `ci.yml`.
- push a `main` → `cd-backend.yml` (calidad + deploy a prod).
