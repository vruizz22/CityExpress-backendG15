# Fixes de seguridad a nivel cuenta (RNF03 — hallazgos Prowler).

# [HIGH] s3_account_level_public_access_blocks
# Bloquea acceso público a nivel de TODA la cuenta. Seguro: el bucket del
# frontend se sirve por CloudFront OAC (no es público), no por policy pública.
resource "aws_s3_account_public_access_block" "this" {
  account_id              = var.aws_account_id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# [HIGH] ec2_instance_account_imdsv2_enabled
# Exige IMDSv2 como default de cuenta (región) para instancias nuevas.
# La instancia actual ya está en httpTokens=required, así que esto no la toca.
resource "aws_ec2_instance_metadata_defaults" "this" {
  http_tokens                 = "required"
  http_put_response_hop_limit = 2
  http_endpoint               = "enabled"
}
