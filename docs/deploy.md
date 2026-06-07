# Deploy E1 — CityExpress G15

> Persona 5: DevOps · AWS · Auth · Monitoring · Docs. Esta guía documenta el despliegue E1 con los valores reales disponibles al 2026-05-03. No contiene secretos.

---

## 1. Visión General

Flujo público principal:

```text
Browser SPA -> CloudFront/S3 -> static assets
Browser SPA -> API Gateway HTTP API -> NGINX EC2 -> master NestJS -> Postgres
API Gateway -> Auth0 JWT authorizer
API Gateway -> append X-Origin-Auth -> NGINX validates shared secret
connector Docker container <-> broker.iic2173.org (/fulfillment)
connector Docker container -> master (http://master:3000)
master + EC2 host -> New Relic
```

Principios de E1:

- El dominio público del backend es `https://api.andresitowan.com`.
- El origen directo vive en `https://origin-api.andresitowan.com` y debe devolver 403 si falta `X-Origin-Auth`, salvo `/healthz`.
- El frontend productivo vive en `https://app.andresitowan.com`; el dominio CloudFront transitorio es `https://d2emu55e9ka9fs.cloudfront.net`.
- Producción usa tags Docker por SHA corto (`<git-sha-7>`), nunca `latest`.

## 2. Prerrequisitos

- Cuenta AWS `353731341232`, región `us-east-1`.
- Dominio `andresitowan.com` administrado en Namecheap.
- AWS CLI autenticada localmente.
- Docker con `buildx`.
- Repositorio backend clonado y branch `feature/backend-deploy` mergeada en la base de despliegue.
- Acceso SSH a la instancia EC2 `cityexpress-ec2` (`i-0bfbc93f5e6340508`).
- Secreto de origen generado fuera del repo:

```bash
openssl rand -hex 32
```

Usar el resultado solo como `<shared-secret-32-bytes-hex>` en NGINX y API Gateway.

## 3. AWS One-Time

### 3.1 Budget alerts

Crear un budget mensual de USD 12 antes de levantar recursos:

| Umbral | Monto | Acción |
|---|---:|---|
| 50% | USD 6.00 | Email a `guillocareym@gmail.com` |
| 80% | USD 9.60 | Email a `guillocareym@gmail.com` |
| 100% | USD 12.00 | Email a `guillocareym@gmail.com` |


### 3.2 ACM us-east-1

Solicitar certificados públicos en ACM `us-east-1`:

| Dominio | Uso |
|---|---|
| `api.andresitowan.com` | API Gateway custom domain |
| `app.andresitowan.com` | CloudFront alternate domain |

La validación DNS debe hacerse en Namecheap con los CNAME entregados por ACM. No usar ARNs inventados; registrar los ARNs reales como `<TODO>` si se necesitan en scripts.

### 3.3 ECR

Repositorios:

```bash
aws ecr create-repository \
  --repository-name cityexpress-master \
  --image-scanning-configuration scanOnPush=true \
  --region us-east-1

aws ecr create-repository \
  --repository-name cityexpress-connector \
  --image-scanning-configuration scanOnPush=true \
  --region us-east-1
```

Registry:

```text
353731341232.dkr.ecr.us-east-1.amazonaws.com
```

### 3.4 IAM instance profile EC2

La EC2 debe tener un instance profile con permisos solo de pull desde ECR. Actions exactas del plan §5.2:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": [
        "arn:aws:ecr:us-east-1:353731341232:repository/cityexpress-master",
        "arn:aws:ecr:us-east-1:353731341232:repository/cityexpress-connector"
      ]
    }
  ]
}
```

Instance profile name: `<TODO>`.

## 4. Provisioning EC2

Estado real:

| Campo | Valor |
|---|---|
| Instance ID | `i-0bfbc93f5e6340508` |
| Name | `cityexpress-ec2` |
| AMI | Ubuntu 24.04 LTS |
| Type | `t3.micro` |
| AZ | `us-east-1d` |
| Elastic IP | `52.5.25.114` |
| Storage | 20 GiB gp3 |

Security Group:

| Puerto | Source | Uso |
|---:|---|---|
| 22/tcp | `<owner-ip>/32` | SSH |
| 80/tcp | `0.0.0.0/0` | ACME challenge + redirect |
| 443/tcp | `0.0.0.0/0` | HTTPS origin |

No abrir 3000, 5432 ni puertos internos.

Bootstrap:

```bash
sudo apt update
sudo apt -y upgrade
sudo apt -y install docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
sudo usermod -aG docker ubuntu
sudo systemctl enable --now docker
sudo systemctl enable --now nginx
sudo mkdir -p /opt/cityexpress
```

Copiar `docker-compose.prod.yml` a:

```text
/opt/cityexpress/docker-compose.prod.yml
```

Crear `/opt/cityexpress/.env` con placeholders seguros:

```env
ECR_REGISTRY=353731341232.dkr.ecr.us-east-1.amazonaws.com
IMAGE_TAG=<git-sha-7>

POSTGRES_USER=<postgres-user>
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_DB=<postgres-db>

CITY_ID=TK3

NEW_RELIC_LICENSE_KEY=<license-key>

RABBITMQ_URL=amqps://<broker-user>:<broker-password>@broker.iic2173.org:5671/fulfillment
RABBITMQ_QUEUE=<TODO>
MASTER_API_URL=http://master:3000

ORIGIN_SHARED_SECRET=<shared-secret-32-bytes-hex>
```

El `docker-compose.prod.yml` del repo construye `DATABASE_URL` desde `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`. No duplicar `DATABASE_URL` en `.env`.

## 5. DNS Namecheap

Registros para `andresitowan.com`:

| Host | Type | Value |
|---|---|---|
| `api` | A o ALIAS | `<TODO>` |
| `origin-api` | A | `52.5.25.114` |
| `app` | CNAME | `d2emu55e9ka9fs.cloudfront.net` |
| `_acme-challenge` o CNAME ACM | TXT/CNAME | `<TODO>` |

Notas:

- `api` apunta al target del custom domain de API Gateway; ese target no está listado en el estado real, por eso queda como `<TODO>`.
- `origin-api` apunta directo a la Elastic IP y se protege con NGINX.
- Los registros de validación ACM/ACME deben copiarse literalmente desde ACM o Certbot.

## 6. NGINX

Archivo:

```text
/etc/nginx/sites-available/cityexpress.conf
```

Config:

```nginx
map_hash_bucket_size 128;

map $http_x_origin_auth $origin_auth_ok {
    default 0;
    "<shared-secret-32-bytes-hex>" 1;
}

server {
    listen 80;
    server_name origin-api.andresitowan.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name origin-api.andresitowan.com;

    ssl_certificate     /etc/letsencrypt/live/origin-api.andresitowan.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/origin-api.andresitowan.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location = /healthz {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
    }

    location / {
        if ($origin_auth_ok = 0) { return 403; }

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
}
```

El `map_hash_bucket_size 128;` queda arriba del `map` como workaround del error de hash bucket observado durante el deploy.

Activar sitio:

```bash
sudo ln -s /etc/nginx/sites-available/cityexpress.conf /etc/nginx/sites-enabled/cityexpress.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Check rápido de health pública:

```bash
curl -i https://origin-api.andresitowan.com/healthz
```

## 7. Certbot

Emitir certificado Let's Encrypt para el origen:

```bash
sudo certbot --nginx -d origin-api.andresitowan.com --non-interactive --agree-tos -m guillocareym@gmail.com --redirect
```

Certificados esperados:

```text
/etc/letsencrypt/live/origin-api.andresitowan.com/
```

Timer de sistema:

```bash
sudo systemctl status certbot.timer
```

Cron de respaldo:

```cron
0 3,15 * * * certbot renew --quiet --post-hook "systemctl reload nginx"
```

## 8. Build y Push de Imágenes

### 8.1 Master

```bash
export AWS_REGION=us-east-1
export ECR_REGISTRY=353731341232.dkr.ecr.us-east-1.amazonaws.com
export GIT_SHA=$(git rev-parse --short=7 HEAD)

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_REGISTRY

docker buildx build \
  --platform linux/amd64 \
  -t $ECR_REGISTRY/cityexpress-master:$GIT_SHA \
  -f Dockerfile \
  --push .
```

### 8.2 Connector

El connector vive en el subdirectorio `connector/` de este mismo repo:

```bash
export AWS_REGION=us-east-1
export ECR_REGISTRY=353731341232.dkr.ecr.us-east-1.amazonaws.com
export GIT_SHA=$(git rev-parse --short=7 HEAD)

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_REGISTRY

docker buildx build \
  --platform linux/amd64 \
  -t $ECR_REGISTRY/cityexpress-connector:$GIT_SHA \
  -f connector/Dockerfile \
  --push connector
```

## 9. Pull y Arranque en EC2

En la EC2:

```bash
sudo aws ecr get-login-password --region us-east-1 \
  | sudo docker login --username AWS --password-stdin 353731341232.dkr.ecr.us-east-1.amazonaws.com

cd /opt/cityexpress
sudo docker compose -f docker-compose.prod.yml --env-file .env pull
sudo docker compose -f docker-compose.prod.yml --env-file .env up -d
sudo docker compose -f docker-compose.prod.yml --env-file .env ps
```

Ver logs:

```bash
sudo docker compose -f /opt/cityexpress/docker-compose.prod.yml --env-file /opt/cityexpress/.env logs master --tail=80
sudo docker compose -f /opt/cityexpress/docker-compose.prod.yml --env-file /opt/cityexpress/.env logs connector --tail=80
```

## 10. API Gateway HTTP API

Crear HTTP API:

| Campo | Valor |
|---|---|
| API name | `cityexpress-api` |
| Custom domain | `api.andresitowan.com` |
| ACM region | `us-east-1` |
| Integration type | HTTP proxy (ANY method, path-as-is) |
| HTTP URI | `https://origin-api.andresitowan.com` |
| Timeout | 30000 ms |

> El integration es path-as-is: API Gateway propaga el path de la ruta directamente al origin. **No** se usa parameter mapping `{proxy}` ni transformación de path.

JWT authorizer Auth0:

| Campo | Valor |
|---|---|
| Identity source | `$request.header.Authorization` |
| Issuer URL | `https://frontendg15cityexpress.us.auth0.com/` |
| Audience | `https://api.andresitowan.com` |

Parameter mapping obligatorio:

```text
append header X-Origin-Auth: <shared-secret-32-bytes-hex>
```

Rutas:

| Method | Route | Auth |
|---|---|---|
| GET | `/` | NONE |
| GET | `/packages` | JWT |
| GET | `/packages/{id}` | JWT |
| POST | `/packages/{id}/deliver` | JWT |
| GET | `/routes` | JWT |

CORS:

| Campo | Valor |
|---|---|
| Origins | `http://localhost:5173`, `https://app.andresitowan.com`, `https://d2emu55e9ka9fs.cloudfront.net` |
| Methods | `GET`, `POST`, `OPTIONS` |
| Headers | `Authorization`, `Content-Type` |
| Credentials | `false` |

## 11. Frontend en S3 y CloudFront

Estado real:

| Campo | Valor |
|---|---|
| Bucket S3 | `cityexpress-frontend-andresitowan` |
| CloudFront distribution ID | `EYMIU0TNOQ7F9` |
| CloudFront domain | `d2emu55e9ka9fs.cloudfront.net` |
| Alternate domain | `app.andresitowan.com` |
| ACM region | `us-east-1` |

Crear bucket privado:

```bash
aws s3api create-bucket \
  --bucket cityexpress-frontend-andresitowan \
  --region us-east-1

aws s3api put-public-access-block \
  --bucket cityexpress-frontend-andresitowan \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

CloudFront:

- Origin: bucket S3 privado.
- Access: Origin Access Control (OAC).
- Default root object: `index.html`.
- Custom error response: `403 -> /index.html -> 200`.
- Custom error response: `404 -> /index.html -> 200`.
- Alternate domain: `app.andresitowan.com`.
- Certificate: ACM `us-east-1` para `app.andresitowan.com`.

Deploy del build frontend:

```bash
aws s3 sync dist/ s3://cityexpress-frontend-andresitowan/ --delete
aws cloudfront create-invalidation --distribution-id EYMIU0TNOQ7F9 --paths '/*'
```

Variables que P5 entrega a P4:

```env
VITE_API_BASE_URL=https://api.andresitowan.com
VITE_AUTH0_DOMAIN=frontendg15cityexpress.us.auth0.com
VITE_AUTH0_CLIENT_ID=sb1CnASsgLO1tOpYWHMgrqA8ADLOsnK6
VITE_AUTH0_AUDIENCE=https://api.andresitowan.com
```

## 12. Smoke Tests

Preparar token desde el SPA o Auth0. No commitear ni pegar el token en docs:

```bash
export TOKEN=<auth0-access-token>
```

Cuatro checks mínimos:

```bash
# 403: direct origin without shared secret
curl -i https://origin-api.andresitowan.com/packages

# 200: direct origin with shared secret
curl -i https://origin-api.andresitowan.com/packages -H "X-Origin-Auth: <shared-secret-32-bytes-hex>"

# 401: API Gateway without token
curl -i https://api.andresitowan.com/packages

# 200: API Gateway with JWT token
curl -i https://api.andresitowan.com/packages -H "Authorization: Bearer $TOKEN"
```

Preflight CORS adicional:

```bash
curl -i -X OPTIONS https://api.andresitowan.com/packages \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

## 13. Releases

| Fecha | git sha | Cambios | Status |
|---|---|---|---|
| 2026-05-03 | `<sha>` | Primer prod + New Relic APM | OK |

## 14. Rollback

1. Elegir un SHA anterior desde la tabla de releases.
2. Actualizar `IMAGE_TAG` en la EC2.
3. Pull de imágenes.
4. Levantar compose.
5. Ejecutar smoke tests.

Comandos:

```bash
cd /opt/cityexpress
sudo sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<previous-git-sha-7>/' /opt/cityexpress/.env
sudo docker compose -f docker-compose.prod.yml --env-file .env pull
sudo docker compose -f docker-compose.prod.yml --env-file .env up -d
sudo docker compose -f docker-compose.prod.yml --env-file .env ps
```

Si el rollback falla, revisar logs:

```bash
sudo docker logs cityexpress_master --tail=80
sudo docker logs cityexpress_connector --tail=80
sudo journalctl -u nginx --since "15 minutes ago"
```

## 15. Seguridad y Límites

- Nunca commitear `/opt/cityexpress/.env`, `.pem`, passwords, access keys, `NEW_RELIC_LICENSE_KEY` ni `ORIGIN_SHARED_SECRET`.
- `X-Origin-Auth` no debe aparecer en el frontend ni en CORS allowed headers.
- La DB queda dentro de Docker Compose con volumen `pgdata`; no está expuesta al host.
- Dump mínimo recomendado antes de deploys grandes:

```bash
sudo mkdir -p /opt/cityexpress/backups
sudo docker exec cityexpress_db pg_dump -U <postgres-user> <postgres-db> > /opt/cityexpress/backups/<yyyy-mm-dd>.sql
```

