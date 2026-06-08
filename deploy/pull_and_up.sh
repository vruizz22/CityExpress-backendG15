#!/usr/bin/env bash
# CodeDeploy hook (AfterInstall) — corre en la EC2 como root.
# Lee el tag de imagen recién copiado, actualiza IMAGE_TAG en el .env de prod
# (sin tocar los secretos), hace login a ECR con el instance profile y levanta.
set -euo pipefail

APP_DIR=/opt/cityexpress
AWS_REGION=us-east-1
ECR_REGISTRY=353731341232.dkr.ecr.us-east-1.amazonaws.com
COMPOSE="docker compose -f ${APP_DIR}/docker-compose.prod.yml --env-file ${APP_DIR}/.env"

cd "${APP_DIR}"

IMAGE_TAG="$(cat "${APP_DIR}/image_tag")"
echo "Desplegando IMAGE_TAG=${IMAGE_TAG}"

# Actualiza solo IMAGE_TAG en el .env existente (que tiene los secretos).
if grep -q '^IMAGE_TAG=' "${APP_DIR}/.env"; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${IMAGE_TAG}/" "${APP_DIR}/.env"
else
  echo "IMAGE_TAG=${IMAGE_TAG}" >> "${APP_DIR}/.env"
fi

# Login a ECR usando el instance profile de la EC2 (sin keys en disco).
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Pull de la imagen nueva y arranque. Las migraciones Prisma corren solas en el
# CMD del contenedor (pnpx prisma migrate deploy && start:prod).
${COMPOSE} pull
${COMPOSE} up -d

# Limpia imágenes sin usar (las viejas por SHA, que NO son dangling) para no
# llenar el disco de la t3.micro. No toca volúmenes (la DB queda intacta).
docker image prune -af || true
