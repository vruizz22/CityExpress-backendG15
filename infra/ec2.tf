# RNF02 (bonus) — Adopción de la EC2 del backend + su SG + rol/instance-profile.
# Estos recursos ya existían desde E1 (launch-wizard). Se importan a IaC (drift 0), SIN
# recrear nada. La instancia lleva prevent_destroy: si un plan pidiera reemplazo,
# el apply FALLA en vez de tumbar producción.

# ── Rol / instance profile de la EC2 ───────────────────────────────────────
# Nota: la inline policy `cityexpress-subscriptions-start` la gestiona
# backend-iam.tf (aws_iam_role_policy.backend_sfn). Acá se define el rol SIN
# bloques inline_policy, así que Terraform NO toca/borra las inline existentes.
import {
  to = aws_iam_role.ec2
  id = "cityexpress-ec2-role"
}
resource "aws_iam_role" "ec2" {
  name                 = "cityexpress-ec2-role"
  description          = "Allows EC2 instances to call AWS services on your behalf."
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

import {
  to = aws_iam_role_policy_attachment.ec2_ecr_read
  id = "cityexpress-ec2-role/arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}
resource "aws_iam_role_policy_attachment" "ec2_ecr_read" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# Leer el bundle de deploy desde S3 (CodeDeploy lo baja en la instancia).
import {
  to = aws_iam_role_policy.ec2_deploy_s3_read
  id = "cityexpress-ec2-role:cityexpress-deploy-s3-read"
}
resource "aws_iam_role_policy" "ec2_deploy_s3_read" {
  name = "cityexpress-deploy-s3-read"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = "arn:aws:s3:::cityexpress-deploy-artifacts/*"
    }]
  })
}

# Invocar la Lambda de jobs (RNF06) desde el worker.
import {
  to = aws_iam_role_policy.ec2_invoke_lambda
  id = "cityexpress-ec2-role:cityexpress-invoke-lambda"
}
resource "aws_iam_role_policy" "ec2_invoke_lambda" {
  name = "cityexpress-invoke-lambda"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:cityexpress-jobs-worker-prod-compute"
    }]
  })
}

import {
  to = aws_iam_instance_profile.ec2
  id = "cityexpress-ec2-role"
}
resource "aws_iam_instance_profile" "ec2" {
  name = "cityexpress-ec2-role"
  role = aws_iam_role.ec2.name
}

# ── Security group (citiexpress-ec2-sg) ────────────────────────────────────
# Las reglas se gestionan abajo como recursos por-regla (aws_vpc_security_group_*_rule),
# así que el grupo ignora ingress/egress inline (evita que intente revocarlas).
import {
  to = aws_security_group.ec2
  id = "sg-06fd1fee380666b88"
}
resource "aws_security_group" "ec2" {
  name        = "citiexpress-ec2-sg"
  description = "launch-wizard-1 created 2026-05-03T10:38:34.163Z"
  vpc_id      = "vpc-096f88e8e1842a4be"

  lifecycle {
    ignore_changes = [ingress, egress]
  }
}

# HTTP / HTTPS públicos (NGINX) + SSH acotado a IPs del owner. Cada CIDR es una
# regla propia (así matchean las descripciones por-CIDR de AWS).
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.ec2.id
  description       = "Public HTTP (redirect to 443)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.ec2.id
  description       = "Public HTTPS Nginx"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

# SSH: una regla por IP del owner (recursos explícitos para importarlas 1:1 por
# su rule-id, sin depender de import for_each).
import {
  to = aws_vpc_security_group_ingress_rule.ssh_owner
  id = "sgr-00f8382044d1ce609"
}
resource "aws_vpc_security_group_ingress_rule" "ssh_owner" {
  security_group_id = aws_security_group.ec2.id
  description       = "SSH from owner only"
  cidr_ipv4         = "191.113.130.123/32"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

import {
  to = aws_vpc_security_group_ingress_rule.ssh_2
  id = "sgr-018dad3823aefdba0"
}
resource "aws_vpc_security_group_ingress_rule" "ssh_2" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "191.113.139.240/32"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

import {
  to = aws_vpc_security_group_ingress_rule.ssh_3
  id = "sgr-0cb9b19b850d469ae"
}
resource "aws_vpc_security_group_ingress_rule" "ssh_3" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "191.113.156.23/32"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

import {
  to = aws_vpc_security_group_ingress_rule.ssh_4
  id = "sgr-04c1f3dcf17503caf"
}
resource "aws_vpc_security_group_ingress_rule" "ssh_4" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "191.113.158.187/32"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

import {
  to = aws_vpc_security_group_ingress_rule.ssh_5
  id = "sgr-082b5eb7fdab6a50b"
}
resource "aws_vpc_security_group_ingress_rule" "ssh_5" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "191.113.159.244/32"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

import {
  to = aws_vpc_security_group_ingress_rule.ssh_6
  id = "sgr-0369ee070edde7a8c"
}
resource "aws_vpc_security_group_ingress_rule" "ssh_6" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "191.113.146.88/32"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

import {
  to = aws_vpc_security_group_egress_rule.all
  id = "sgr-017d2f49ca2c51e67"
}
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Imports de las 2 reglas públicas (definidas arriba).
import {
  to = aws_vpc_security_group_ingress_rule.http
  id = "sgr-0668c69bab1969f82"
}
import {
  to = aws_vpc_security_group_ingress_rule.https
  id = "sgr-0d55580cb83966156"
}

# ── Instancia del backend ──────────────────────────────────────────────────
import {
  to = aws_instance.backend
  id = "i-0bfbc93f5e6340508"
}
resource "aws_instance" "backend" {
  ami                    = "ami-05cf1e9f73fbad2e2"
  instance_type          = "t3.small"
  key_name               = "cityexpress-e1"
  subnet_id              = "subnet-0fb915f5531ddc736"
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  ebs_optimized          = true
  monitoring             = false
  source_dest_check      = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    iops                  = 3000
    throughput            = 125
    delete_on_termination = true
    encrypted             = false
  }

  tags = {
    Name = "cityexpress-ec2"
  }

  lifecycle {
    prevent_destroy = true
    # Atributos volátiles/irreconstruibles de una instancia hecha a mano.
    # Nunca deben forzar reemplazo de producción.
    ignore_changes = [ami, user_data, user_data_base64, associate_public_ip_address]
  }
}
