# Cola de ticks + DLQ. La state machine escribe acá (sqs:sendMessage.waitForTaskToken)
# y la Dispatcher Lambda la consume (event source mapping).

resource "aws_sqs_queue" "tick_dlq" {
  name                      = "${var.name_prefix}-tick-dlq"
  message_retention_seconds = 1209600 # 14 días para inspeccionar mensajes muertos
}

resource "aws_sqs_queue" "tick" {
  name = "${var.name_prefix}-tick"

  # Debe ser >= al timeout de la Lambda; AWS recomienda ~6x para el event source
  # mapping (deja margen a reintentos internos antes de re-entregar).
  visibility_timeout_seconds = var.lambda_timeout_seconds * 6

  # Safety net para mensajes veneno (JSON inválido / fallas de infra que hagan
  # crashear la Lambda sin borrar el mensaje). Los reintentos LÓGICOS del tick
  # los maneja el Retry de la state machine con un token nuevo, no esta cola.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.tick_dlq.arn
    maxReceiveCount     = 5
  })
}
