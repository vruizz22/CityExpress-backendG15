variable "aws_region" {
  description = "Región AWS donde vive la infra del backend."
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "ID de la cuenta AWS (para construir ARNs / validar el caller)."
  type        = string
  default     = "353731341232"
}

# ── Motor de suscripciones (módulo subscriptions / RF01) ───────────────────
variable "subscriptions_backend_url" {
  description = <<-EOT
    URL base del backend al que la Dispatcher Lambda le pega el /tick.
    Sin slash final. Setear como variable de Terraform Cloud (workspace).
  EOT
  type        = string
}

variable "subscriptions_tick_secret" {
  description = <<-EOT
    Secreto del endpoint /tick (x-tick-secret). MISMO valor que
    SUBSCRIPTION_TICK_SECRET del backend. Variable SENSIBLE de TF Cloud, NO se commitea.
  EOT
  type        = string
  sensitive   = true
}

variable "backend_ec2_role_name" {
  description = "Rol/instance-profile de la EC2 del backend (se le agrega StartExecution sobre la state machine)."
  type        = string
  default     = "cityexpress-ec2-role"
}
