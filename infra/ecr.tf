# [MEDIUM] ecr_repositories_scan_images_on_push_enabled + tag immutability.
# Adopta (import) los 3 repos ECR existentes y les activa escaneo al pushear +
# tags inmutables. Seguro: el CD sólo pushea tags git-sha únicos (no reusa tags).

import {
  to = aws_ecr_repository.master
  id = "cityexpress-master"
}
resource "aws_ecr_repository" "master" {
  name                 = "cityexpress-master"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

import {
  to = aws_ecr_repository.jobs
  id = "cityexpress-jobs"
}
resource "aws_ecr_repository" "jobs" {
  name                 = "cityexpress-jobs"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

import {
  to = aws_ecr_repository.connector
  id = "cityexpress-connector"
}
resource "aws_ecr_repository" "connector" {
  name                 = "cityexpress-connector"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}
