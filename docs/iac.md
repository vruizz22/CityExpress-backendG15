# RNF02 — Infraestructura como código (Terraform)

> **Herramienta:** Terraform 1.15.7 (`required_version >= 1.5`) · **Estado remoto:** Terraform Cloud.
> **Org:** `cityexpress-g15` · **Workspace:** `cityexpress-infra` (CLI-driven, ejecución **remota**).
> **Cuenta AWS:** `353731341232` · **Región:** `us-east-1`. Todo el IaC vive en [`infra/`](../infra/).
> **Estrategia:** **adoptar** (import) la infra que ya existía + **crear** la infra nueva de E3, hasta llegar a `plan` con **drift 0**.

---

## 1. Estructura

```
infra/
├── versions.tf            # required_version, providers (aws ~>5.0, archive ~>2.4), bloque cloud {} (TF Cloud)
├── providers.tf           # provider aws (us-east-1) + default_tags {Project, ManagedBy, Entrega}
├── variables.tf           # aws_region, aws_account_id, subscriptions_*, backend_ec2_role_name
├── outputs.tf             # ARN state machine, URL cola, nombre Dispatcher
├── main.tf                # module "subscriptions" (motor E3)
├── security-baseline.tf   # RNF03: S3 account BPA + EC2 IMDSv2 default (cuenta)
├── ecr.tf                 # RNF03: import + hardening de los 3 repos ECR
├── artifacts.tf           # RNF03: versioning + TLS policy del bucket de artefactos
├── backend-iam.tf         # inline policy StartExecution en el rol EXISTENTE de la EC2
└── subscriptions/         # ── módulo del motor de suscripciones (E3) ──
    ├── sqs.tf             # cola -tick + DLQ (redrive maxReceiveCount=5)
    ├── iam.tf             # roles SFN y Dispatcher (mínimo privilegio)
    ├── lambda.tf          # archive_file (bundle esbuild) + Lambda + event source mapping
    ├── state-machine.tf   # aws_sfn_state_machine (STANDARD) + log group + templatefile del ASL
    ├── state-machine.asl.json  # definición ASL (${TickQueueUrl} lo sustituye templatefile)
    ├── variables.tf / outputs.tf
    └── local-test/        # test local del ASL con Step Functions Local (mock del Dispatcher)
```

Detalle del motor de suscripciones en [`step-functions.md`](step-functions.md).

---

## 2. Qué se adopta y qué se crea

| Recurso | Estado previo | Cómo lo maneja Terraform | Archivo |
|---|---|---|---|
| 3 repos ECR (`master`, `jobs`, `connector`) | **Existían** | **`import {}`** → adopta sin recrear + hardening (scan on push, tags inmutables) | `ecr.tf` |
| Bucket `cityexpress-deploy-artifacts` (versioning + policy TLS) | Bucket existía; sin policy | Gestiona sólo sub-recursos (attach por nombre, sin recrear el bucket) | `artifacts.tf` |
| S3 account Block Public Access | No existía | **Crea** (nivel cuenta) | `security-baseline.tf` |
| EC2 IMDSv2 default (región) | No existía | **Crea** (nivel cuenta) | `security-baseline.tf` |
| Inline policy `StartExecution` en `cityexpress-ec2-role` | Rol existía | **Attach inline policy** al rol (recurso aparte) | `backend-iam.tf` |
| **EC2** `i-0bfbc93f…` del backend | **Existía** (launch-wizard E1) | **`import {}`** + `prevent_destroy` (blindada, nunca se recrea) | `ec2.tf` |
| **Security group** `citiexpress-ec2-sg` + 9 reglas | **Existía** | **`import {}`** (grupo + reglas por-regla) | `ec2.tf` |
| **Instance profile** + rol `cityexpress-ec2-role` (+ ECR read + 2 inline) | **Existía** | **`import {}`** | `ec2.tf` |
| **OIDC provider** `token.actions.githubusercontent.com` | **Existía** | **`import {}`** | `cicd-iam.tf` |
| Roles `github-actions-cityexpress` (+inline CD) y `codedeploy-cityexpress` (+AWSCodeDeployRole) | **Existían** | **`import {}`** | `cicd-iam.tf` |
| **CodeDeploy** app `cityexpress-backend` + deployment group | **Existía** | **`import {}`** | `codedeploy.tf` |
| SQS `-tick` + DLQ | Nuevo (E3) | **Crea** | `subscriptions/sqs.tf` |
| Roles IAM SFN + Dispatcher | Nuevo (E3) | **Crea** | `subscriptions/iam.tf` |
| Dispatcher Lambda + log group + event source mapping | Nuevo (E3) | **Crea** | `subscriptions/lambda.tf` |
| State machine + log group | Nuevo (E3) | **Crea** | `subscriptions/state-machine.tf` |

**Resultados de `apply`:**
- Baseline RNF03 (ECR/S3/EC2): **3 import + 4 add + 3 change · 0 destroy**.
- Motor E3 (módulo `subscriptions`): **12 add · 0 change · 0 destroy**.
- Adopción legacy (EC2/SG/CodeDeploy/OIDC/roles): **23 import · 0 add · 18 change · 0 destroy**.
  Los 18 "change" son **sólo `default_tags`** (Project/ManagedBy/Entrega) sobre los
  recursos adoptados; ningún atributo funcional cambia. El `plan` posterior da
  **`No changes` (drift 0)**.

> El **0 destroy** es la garantía de RNF02: adoptamos lo existente sin recrearlo (nada
> de downtime ni pérdida de datos por "reemplazo"). La EC2 lleva además
> `prevent_destroy = true`: si un plan futuro pidiera reemplazarla, el `apply` **falla**
> en vez de tumbar producción.

---

## 3. Frontera con Serverless Framework

No todo el AWS del proyecto está bajo Terraform, y es **a propósito**:

- La Lambda de cómputo de jobs `cityexpress-jobs-worker-prod-compute` (RNF06) sigue
  gestionada por **Serverless Framework** (ver [`serverless.md`](serverless.md)). Su
  bucket de deploy (`cityexpress-jobs-worker-p-serverlessdeploymentbuck-…`) también.
- El bucket del **frontend** (`cityexpress-frontend-andresitowan`) es de Oriana.

Terraform gestiona: la infra manual existente que adoptamos (ECR, baseline S3/EC2) +
todo lo nuevo de E3. **No** invade el tooling de Serverless ni el scope de otros. Los
FAIL de Prowler que quedan en esos buckets ajenos están documentados como *conocidos /
fuera de alcance* en [`prowler.md`](prowler.md).

---

## 4. Secretos y credenciales (nunca en el repo)

- **Credenciales AWS:** variables de entorno **sensibles** del workspace de TF Cloud
  (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). No hay llaves en el HCL.
- **`subscriptions_tick_secret`:** variable **sensible** de TF Cloud (`sensitive = true`
  en Terraform). Es el mismo valor que `SUBSCRIPTION_TICK_SECRET` del backend y del
  `.env` de la EC2 — los **tres** deben coincidir.
- `.gitignore` bloquea `*.tfvars`, `*.tfstate`, `subscriptions/dist/`, `dispatcher.zip`.

---

## 5. Cómo recrear / operar

### Bundle de la Dispatcher Lambda (ANTES del apply)
El `archive_file` zipea `infra/subscriptions/dist/`, que produce esbuild:

```bash
cd jobs-service && npm run build:dispatch   # → infra/subscriptions/dist/index.js
```

(`@aws-sdk/*` queda `external`: ya viene en el runtime `nodejs20.x`.) Corre en TF Cloud
modo **remoto** porque el `dist/` se sube junto con la config.

### Aplicar
```bash
cd infra
terraform init          # backend remoto (TF Cloud)
terraform plan          # revisar: 0 destroy
terraform apply
terraform output subscriptions_state_machine_arn
```

### Validar sin TF Cloud (sólo sintaxis)
```bash
cd infra
terraform init -backend=false
terraform fmt -check
terraform validate
```

### Setup inicial de Terraform Cloud (una vez)
Pasos detallados en [`../infra/README.md`](../infra/README.md): crear org + workspace
CLI-driven, cargar credenciales AWS como env vars sensibles, `terraform login`, `init`.

---

## 6. Estado de adopción (drift)

| Componente | En Terraform | Drift |
|---|---|---|
| Motor E3 (SFN/SQS/Lambda/IAM) | ✅ creado por Terraform | 0 |
| ECR ×3 | ✅ importado | 0 |
| S3 baseline + artefactos | ✅ gestionado | 0 |
| Inline policy EC2 (StartExecution) | ✅ gestionado | 0 |
| EC2 + Security group (+9 reglas) + instance profile | ✅ importado (`prevent_destroy`) | 0 |
| Roles `ec2` / `github-actions` / `codedeploy` (+ policies) | ✅ importado | 0 |
| OIDC provider (GitHub Actions) | ✅ importado | 0 |
| CodeDeploy app + deployment group | ✅ importado | 0 |

> **Bonus RNF02 (+5) logrado:** toda la infra del backend —la nueva de E3 **y** la
> legacy de E1 (EC2, SG, CodeDeploy, OIDC, roles)— está en código con **`plan` = No
> changes (drift 0)**. Frontera intacta con Serverless (§3).
