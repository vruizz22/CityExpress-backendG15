# Permiso para que el backend (rol de la EC2) dispare/pare ejecuciones de la
# state machine de suscripciones. Se agrega como INLINE POLICY al rol EXISTENTE
# (cityexpress-ec2-role) sin adoptar el rol completo en Terraform → cambio acotado.
#
# Con esto el SfnSubscriptionTrigger de Andrés puede hacer StartExecution, y el
# StopExecution para cancelar suscripciones (ver E3/contrato-trigger-andres.md).

data "aws_iam_policy_document" "backend_sfn" {
  statement {
    sid       = "StartSubscriptionExecutions"
    actions   = ["states:StartExecution"]
    resources = [module.subscriptions.state_machine_arn]
  }

  statement {
    sid = "ManageSubscriptionExecutions"
    actions = [
      "states:StopExecution",
      "states:DescribeExecution",
    ]
    # ARNs de ejecución de esta state machine: :execution:<nombre>:<exec>
    resources = ["${replace(module.subscriptions.state_machine_arn, ":stateMachine:", ":execution:")}:*"]
  }
}

resource "aws_iam_role_policy" "backend_sfn" {
  name   = "cityexpress-subscriptions-start"
  role   = var.backend_ec2_role_name
  policy = data.aws_iam_policy_document.backend_sfn.json
}
