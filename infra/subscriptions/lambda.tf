# Dispatcher Lambda: consume la cola de ticks, llama al backend (/tick) y
# devuelve el TickResult a la state machine (SendTaskSuccess/Failure).
#
# El bundle lo genera esbuild ANTES del apply:
#   cd jobs-service && npm run build:dispatch   → infra/subscriptions/dist/index.js
# (@aws-sdk/* queda external: ya viene en el runtime nodejs20.x).

data "archive_file" "dispatcher" {
  type        = "zip"
  source_dir  = "${path.module}/dist"
  output_path = "${path.module}/dispatcher.zip"
}

resource "aws_cloudwatch_log_group" "dispatcher" {
  name              = "/aws/lambda/${var.name_prefix}-dispatcher"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "dispatcher" {
  function_name = "${var.name_prefix}-dispatcher"
  role          = aws_iam_role.dispatcher.arn
  runtime       = "nodejs20.x"
  handler       = "index.dispatch"
  timeout       = var.lambda_timeout_seconds
  memory_size   = 256

  filename         = data.archive_file.dispatcher.output_path
  source_code_hash = data.archive_file.dispatcher.output_base64sha256

  environment {
    variables = {
      BACKEND_URL              = var.backend_url
      SUBSCRIPTION_TICK_SECRET = var.tick_secret
      TICK_TIMEOUT_MS          = tostring(var.tick_timeout_ms)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.dispatcher_basic,
    aws_cloudwatch_log_group.dispatcher,
  ]
}

# SQS → Lambda. batch_size=1: cada tick es una ejecución pausada distinta.
resource "aws_lambda_event_source_mapping" "tick" {
  event_source_arn = aws_sqs_queue.tick.arn
  function_name    = aws_lambda_function.dispatcher.arn
  batch_size       = 1
  enabled          = true
}
