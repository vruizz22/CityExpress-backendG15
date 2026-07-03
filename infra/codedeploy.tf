# RNF02 (bonus) — Adopción de CodeDeploy (app + deployment group) del backend.
# El CD (cd-backend.yml) crea deployments contra esta app; se importa a IaC.

import {
  to = aws_codedeploy_app.backend
  id = "cityexpress-backend"
}
resource "aws_codedeploy_app" "backend" {
  name             = "cityexpress-backend"
  compute_platform = "Server"
}

import {
  to = aws_codedeploy_deployment_group.backend
  id = "cityexpress-backend:cityexpress-backend-dg"
}
resource "aws_codedeploy_deployment_group" "backend" {
  app_name               = aws_codedeploy_app.backend.name
  deployment_group_name  = "cityexpress-backend-dg"
  service_role_arn       = aws_iam_role.codedeploy.arn
  deployment_config_name = "CodeDeployDefault.AllAtOnce"

  deployment_style {
    deployment_type   = "IN_PLACE"
    deployment_option = "WITHOUT_TRAFFIC_CONTROL"
  }

  # Despliega sobre la(s) instancia(s) con tag Name=cityexpress-ec2.
  ec2_tag_filter {
    key   = "Name"
    type  = "KEY_AND_VALUE"
    value = "cityexpress-ec2"
  }
}
