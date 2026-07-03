# Outputs de la infra.

# ── Motor de suscripciones (RF01) ──────────────────────────────────────────
output "subscriptions_state_machine_arn" {
  description = "ARN de la state machine → se lo paso a Andrés (StartExecution / SUBSCRIPTIONS_STATE_MACHINE_ARN)."
  value       = module.subscriptions.state_machine_arn
}

output "subscriptions_tick_queue_url" {
  description = "URL de la cola de ticks."
  value       = module.subscriptions.tick_queue_url
}

output "subscriptions_dispatcher_function_name" {
  description = "Nombre de la Dispatcher Lambda."
  value       = module.subscriptions.dispatcher_function_name
}
