# Fixes sobre el bucket de artefactos de deploy (RNF03 — hallazgos Prowler).
# El bucket ya existe (creado a mano); acá se gestionan sólo su config de
# versioning y su policy (no había policy previa → se crea limpia).

locals {
  artifacts_bucket = "cityexpress-deploy-artifacts"
}

# [MEDIUM] s3_bucket_object_versioning
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = local.artifacts_bucket
  versioning_configuration {
    status = "Enabled"
  }
}

# [MEDIUM] s3_bucket_secure_transport_policy — rechaza requests sin HTTPS.
# El CD accede por HTTPS (SDK/CLI), así que no lo rompe.
resource "aws_s3_bucket_policy" "artifacts_tls" {
  bucket = local.artifacts_bucket
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          "arn:aws:s3:::${local.artifacts_bucket}",
          "arn:aws:s3:::${local.artifacts_bucket}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}
