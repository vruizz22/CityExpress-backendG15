# ── Rol de la Dispatcher Lambda ────────────────────────────────────────────
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dispatcher" {
  name               = "${var.name_prefix}-dispatcher"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs en CloudWatch.
resource "aws_iam_role_policy_attachment" "dispatcher_basic" {
  role       = aws_iam_role.dispatcher.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "dispatcher" {
  # Consumir la cola de ticks (event source mapping).
  statement {
    sid = "ConsumeTickQueue"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.tick.arn]
  }

  # Devolver el resultado del tick a la ejecución pausada (waitForTaskToken).
  # El task token no es un ARN → estas acciones no soportan resource-level.
  statement {
    sid = "CallbackToStateMachine"
    actions = [
      "states:SendTaskSuccess",
      "states:SendTaskFailure",
      "states:SendTaskHeartbeat",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "dispatcher" {
  name   = "${var.name_prefix}-dispatcher"
  role   = aws_iam_role.dispatcher.id
  policy = data.aws_iam_policy_document.dispatcher.json
}

# ── Rol de la State Machine ────────────────────────────────────────────────
data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${var.name_prefix}-sfn"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

data "aws_iam_policy_document" "sfn" {
  # Encolar el tick (DispatchTick usa sqs:sendMessage).
  statement {
    sid       = "SendTick"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.tick.arn]
  }

  # Logging de la state machine a CloudWatch (la config de logging lo exige a "*").
  statement {
    sid = "Logging"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn" {
  name   = "${var.name_prefix}-sfn"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn.json
}
