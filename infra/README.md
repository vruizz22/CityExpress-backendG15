# Infra (IaC) — Terraform Cloud · RNF02

Infraestructura del backend de CityExpress como código (RNF02). Estado remoto en
**Terraform Cloud**. Estrategia: **importar/adoptar** la infra actual (bonus +5) y
crear la infra nueva de E3 (Step Functions + SQS + Dispatcher Lambda).

## Estructura

| Archivo/dir | Rol |
|---|---|
| `versions.tf` | Versión de Terraform, providers, bloque `cloud {}` (TF Cloud). |
| `providers.tf` | Provider AWS (`us-east-1`) + `default_tags`. |
| `variables.tf` | `aws_region`, `aws_account_id`. |
| `outputs.tf` | Outputs (ARN state machine, URL cola…) — se llenan con los recursos. |
| `subscriptions/` | **NUEVO E3**: state machine ASL + módulo SFN/SQS/Lambda (B3). |

## Setup Terraform Cloud (una vez)

1. **Cuenta + organización.** Entra a https://app.terraform.io, crea cuenta (o login),
   y crea una **Organización** (ej. `cityexpress-g15`). Anota el nombre EXACTO.
2. **Workspace.** Dentro de la org → *New workspace* → tipo **CLI-Driven** → nombre
   `cityexpress-infra` → Create.
3. **Credenciales AWS.** Workspace → *Settings → Variables* → *Add variable* → dos
   **Environment variables** marcadas como **Sensitive**:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   (las mismas de tu `~/.aws`. NUNCA en el repo.)
4. **Enlazar el repo.** En `versions.tf`: pon tu org en `organization = "<tu-org>"`
   y **descomenta** el bloque `cloud {}`.
5. **Login CLI.** `terraform login` → abre el navegador, genera el token, pégalo.
6. **Init.** `cd infra && terraform init -reconfigure`.
7. Listo: `terraform plan` / `apply` corren contra TF Cloud (estado remoto).

## Validar localmente SIN Terraform Cloud

Mientras no esté el workspace, para chequear que el HCL es válido:

```bash
cd infra
terraform init -backend=false
terraform fmt -check
terraform validate
```

## Reglas

- **Nunca** commitear `*.tfvars`, `.tfstate` ni llaves (ver `.gitignore`).
- Los recursos **existentes** se adoptan con bloques `import {}` / `terraform import`
  hasta llegar a `terraform plan` con **drift 0** (Bloque A3).
- La Lambda `cityexpress-jobs-worker-prod-compute` sigue bajo **Serverless Framework**;
  Terraform maneja solo la infra manual existente + lo nuevo de E3.
