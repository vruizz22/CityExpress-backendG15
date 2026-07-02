# Módulo subscriptions (RF01) — entradas.

variable "name_prefix" {
  description = "Prefijo para nombrar los recursos del motor de suscripciones."
  type        = string
  default     = "cityexpress-subscriptions"
}

variable "backend_url" {
  description = <<-EOT
    URL base del backend NestJS al que la Dispatcher Lambda le pega el tick
    (POST {backend_url}/subscriptions/:id/tick). Sin slash final.
    Ej: https://api.cityexpress.example  o  http://<ip-ec2>:8080
  EOT
  type        = string
}

variable "tick_secret" {
  description = <<-EOT
    Secreto compartido del endpoint /tick (header x-tick-secret). MISMO valor
    que SUBSCRIPTION_TICK_SECRET en el backend de Andrés. Se pasa como variable
    SENSIBLE de Terraform Cloud (NUNCA se commitea).
  EOT
  type        = string
  sensitive   = true
}

variable "lambda_timeout_seconds" {
  description = "Timeout de la Dispatcher Lambda. Debe ser < TimeoutSeconds del Task (60s)."
  type        = number
  default     = 30
}

variable "tick_timeout_ms" {
  description = "Timeout del fetch al backend dentro de la Lambda (margen bajo el timeout Lambda)."
  type        = number
  default     = 15000
}

variable "log_retention_days" {
  description = "Retención de logs (CloudWatch) de la state machine y la Lambda."
  type        = number
  default     = 14
}
