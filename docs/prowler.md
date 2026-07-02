# RNF03 — Seguridad con Prowler: hallazgos, fixes y evidencia

> **Herramienta:** Prowler 5.31.1 · **Cuenta AWS:** `353731341232` · **Región:** `us-east-1`
> **Baseline:** 2026-07-01 08:21 · **Re-scan (fixed):** 2026-07-01 17:22
> **Reportes crudos:** se generan localmente con los comandos de la [§6](#6-cómo-reproducir) (CSV + HTML + JSON/OCSF de todos los frameworks, ~32 MB). **No se versionan** (repo liviano); la evidencia antes/después queda resumida en las tablas de abajo.
> **Todos los fixes se aplicaron como código** (Terraform, ver `infra/`) → RNF03 se apoya en RNF02.

---

## 1. Baseline (scan completo)

| Severidad | FAIL |
|---|---:|
| Critical | 3 |
| High | 22 |
| Medium | 73 |
| Low | 38 |
| **Total FAIL** | **136** |
| (PASS) | 162 |

Comando usado:

```bash
prowler aws --output-formats csv html json-ocsf \
  --output-directory docs/prowler/baseline
```

---

## 2. Triage — por qué se eligieron estos fixes (y no otros)

No todos los hallazgos son "arreglables" de forma segura ni razonable en el contexto del ramo. Se clasificaron así:

| Grupo | Ejemplos (baseline) | Decisión |
|---|---|---|
| **Gobernanza de cuenta / IAM** | `iam_no_root_access_key`, `iam_user_administrator_access_policy`, `iam_avoid_root_usage`, MFA de usuarios | ❌ **No tocar**: requieren acción manual del dueño de la cuenta; automatizarlo (p.ej. quitar llaves de root o admin) arriesga **lockout**. |
| **Servicios de pago / a nivel organización** | `guardduty_is_enabled`, `securityhub_enabled`, `config_delegated_admin...`, `cloudtrail_multi_region_enabled`, `organizations_scp...`, delegated admins | ❌ **Fuera de alcance**: cuestan dinero y/o necesitan **AWS Organizations**. No aplica a la cuenta del curso. |
| **Romperían la app** | `ec2_instance_internet_facing_with_instance_profile`, `ec2_securitygroup_allow_ingress_from_internet...`, `vpc_subnet_no_public_ip_by_default` | ❌ **No tocar**: el backend **necesita** ser internet-facing (API pública). "Arreglarlo" tumbaría el servicio. |
| **Cifrado EBS / snapshots** | `ec2_ebs_default_encryption`, `ec2_ebs_volume_encryption` | ⏸️ **Postergado**: implica recrear/mover volúmenes (riesgo de datos), no es un cambio IaC limpio en E3. |
| **✅ Hardening seguro como código** | los 6 checks de la §3 | ✅ **Elegidos**: seguros, sobre recursos **nuestros**, aplicables 100% por Terraform, sin romper nada. |

Criterio de selección: **(a) seguro**, **(b) fixable como código**, **(c) sobre recursos que controlamos**.

---

## 3. Fixes aplicados (vía Terraform)

| Check (Prowler) | Sev | Recurso(s) | Archivo IaC |
|---|---|---|---|
| `s3_account_level_public_access_blocks` | HIGH | Block Public Access a nivel cuenta | [`infra/security-baseline.tf`](../infra/security-baseline.tf) |
| `ec2_instance_account_imdsv2_enabled` | HIGH | IMDSv2 requerido por defecto (cuenta) | [`infra/security-baseline.tf`](../infra/security-baseline.tf) |
| `ecr_registry_scan_images_on_push_enabled` | MEDIUM | 3 repos ECR (master/jobs/connector) | [`infra/ecr.tf`](../infra/ecr.tf) |
| `ecr_repositories_tag_immutability` | MEDIUM | 3 repos ECR | [`infra/ecr.tf`](../infra/ecr.tf) |
| `s3_bucket_object_versioning` | MEDIUM | `cityexpress-deploy-artifacts` | [`infra/artifacts.tf`](../infra/artifacts.tf) |
| `s3_bucket_secure_transport_policy` | MEDIUM | `cityexpress-deploy-artifacts` | [`infra/artifacts.tf`](../infra/artifacts.tf) |

`terraform apply` de estos cambios: **3 import + 4 add + 3 change, 0 destroy** (adopta recursos existentes sin recrearlos).

---

## 4. Verificación — re-scan dirigido (baseline → fixed)

Re-scan acotado a los checks fijados. **Todos los recursos objetivo pasaron FAIL → PASS:**

| Check | Baseline | Fixed |
|---|---|---|
| `s3_account_level_public_access_blocks` | FAIL | ✅ PASS |
| `ec2_instance_account_imdsv2_enabled` | FAIL | ✅ PASS |
| `ecr_registry_scan_images_on_push_enabled` | FAIL ×3 | ✅ PASS ×3 |
| `ecr_repositories_tag_immutability` | FAIL ×3 | ✅ PASS ×3 |
| `s3_bucket_object_versioning` (`cityexpress-deploy-artifacts`) | FAIL | ✅ PASS |
| `s3_bucket_secure_transport_policy` (`cityexpress-deploy-artifacts`) | FAIL | ✅ PASS |

**10 comprobaciones a nivel recurso** pasaron a PASS.

```bash
prowler aws \
  --check s3_account_level_public_access_blocks ec2_instance_account_imdsv2_enabled \
          ecr_registry_scan_images_on_push_enabled ecr_repositories_tag_immutability \
          s3_bucket_object_versioning s3_bucket_secure_transport_policy \
  --output-formats csv html --output-directory docs/prowler/fixed
```

---

## 5. Hallazgos restantes en esos checks (fuera de alcance, esperado)

El re-scan muestra que **quedan FAIL en otros buckets que NO son de este módulo IaC**:

| Check | Bucket que sigue FAIL | Dueño |
|---|---|---|
| `s3_bucket_object_versioning` | `cityexpress-frontend-andresitowan` | Frontend (Oriana) |
| `s3_bucket_object_versioning` | `cityexpress-jobs-worker-p-serverlessdeploymentbuck-…` | Serverless Framework |
| `s3_bucket_secure_transport_policy` | `cityexpress-frontend-andresitowan` | Frontend (Oriana) |

Son buckets fuera de la frontera de este Terraform (el del frontend y el de despliegue de Serverless). Se dejan documentados como **conocidos** y no se tocan para no invadir el scope de otros ni el tooling de Serverless.

---

## 6. Cómo reproducir

```bash
# baseline
prowler aws --output-formats csv html json-ocsf --output-directory docs/prowler/baseline
# aplicar hardening como código
cd infra && terraform apply
# re-scan de verificación (ver comando §4)
```

**Conclusión:** de 136 FAIL del baseline se aplicó hardening **como código** sobre los hallazgos seguros y bajo nuestro control (2 HIGH + 4 categorías MEDIUM → 10 checks FAIL→PASS), con triage explícito de por qué el resto queda fuera de alcance.
