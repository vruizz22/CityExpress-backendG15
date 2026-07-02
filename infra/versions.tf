terraform {
  required_version = ">= 1.5"

  # RNF02 — Estado remoto en Terraform Cloud.
  cloud {
    organization = "cityexpress-g15"
    workspaces {
      name = "cityexpress-infra"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}
