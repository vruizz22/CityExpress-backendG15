# State machine del motor de suscripciones (RF01, workflow Standard).
# El ASL vive en state-machine.asl.json; templatefile sustituye ${TickQueueUrl}.

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/vendedlogs/states/${var.name_prefix}"
  retention_in_days = var.log_retention_days
}

resource "aws_sfn_state_machine" "subscriptions" {
  name     = var.name_prefix
  role_arn = aws_iam_role.sfn.arn
  type     = "STANDARD"

  definition = templatefile("${path.module}/state-machine.asl.json", {
    TickQueueUrl = aws_sqs_queue.tick.url
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = true
    level                  = "ALL"
  }

  depends_on = [aws_iam_role_policy.sfn]
}
