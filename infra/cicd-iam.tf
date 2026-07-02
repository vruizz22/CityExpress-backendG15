# RNF02 (bonus) — Adopción de la identidad de CI/CD existente (OIDC + roles).
# Recursos creados a mano en E1; se importan a Terraform hasta drift 0.
# NO se recrean (import = adopta el recurso vivo tal cual).

# ── OIDC provider de GitHub Actions ────────────────────────────────────────
import {
  to = aws_iam_openid_connect_provider.github
  id = "arn:aws:iam::${var.aws_account_id}:oidc-provider/token.actions.githubusercontent.com"
}
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# ── Rol que asume GitHub Actions (CD) vía OIDC ─────────────────────────────
import {
  to = aws_iam_role.github_actions
  id = "github-actions-cityexpress"
}
resource "aws_iam_role" "github_actions" {
  name                 = "github-actions-cityexpress"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike   = { "token.actions.githubusercontent.com:sub" = "repo:vruizz22/CityExpress-backendG15:*" }
      }
    }]
  })
}

# Permisos de CD: push a ECR + subir bundle a S3 + crear deployment en CodeDeploy.
import {
  to = aws_iam_role_policy.github_actions_cd
  id = "github-actions-cityexpress:cityexpress-cd"
}
resource "aws_iam_role_policy" "github_actions_cd" {
  name = "cityexpress-cd"
  role = aws_iam_role.github_actions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = [
          "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/cityexpress-master",
          "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/cityexpress-jobs",
        ]
      },
      {
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "arn:aws:s3:::cityexpress-deploy-artifacts/*"
      },
      {
        Effect = "Allow"
        Action = [
          "codedeploy:CreateDeployment",
          "codedeploy:GetDeployment",
          "codedeploy:GetDeploymentConfig",
          "codedeploy:RegisterApplicationRevision",
          "codedeploy:GetApplicationRevision",
        ]
        Resource = "*"
      },
    ]
  })
}

# ── Rol de servicio de CodeDeploy ──────────────────────────────────────────
import {
  to = aws_iam_role.codedeploy
  id = "codedeploy-cityexpress"
}
resource "aws_iam_role" "codedeploy" {
  name                 = "codedeploy-cityexpress"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codedeploy.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

import {
  to = aws_iam_role_policy_attachment.codedeploy_service
  id = "codedeploy-cityexpress/arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole"
}
resource "aws_iam_role_policy_attachment" "codedeploy_service" {
  role       = aws_iam_role.codedeploy.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole"
}
