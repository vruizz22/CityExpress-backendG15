output "state_machine_arn" {
  description = "ARN de la state machine (para Andrés → StartExecution)."
  value       = aws_sfn_state_machine.subscriptions.arn
}

output "tick_queue_url" {
  description = "URL de la cola de ticks."
  value       = aws_sqs_queue.tick.url
}

output "tick_queue_arn" {
  description = "ARN de la cola de ticks."
  value       = aws_sqs_queue.tick.arn
}

output "tick_dlq_url" {
  description = "URL de la DLQ."
  value       = aws_sqs_queue.tick_dlq.url
}

output "dispatcher_function_name" {
  description = "Nombre de la Dispatcher Lambda."
  value       = aws_lambda_function.dispatcher.function_name
}
