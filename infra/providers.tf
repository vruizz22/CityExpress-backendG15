provider "aws" {
  region = var.aws_region

  # Credenciales desde el entorno (~/.aws o variables). NUNCA hardcodear llaves
  # aquí (sanción del enunciado por subir secretos).

  default_tags {
    tags = {
      Project   = "CityExpress"
      ManagedBy = "Terraform"
      Entrega   = "E3"
    }
  }
}
