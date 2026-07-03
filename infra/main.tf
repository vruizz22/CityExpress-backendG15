# Motor de suscripciones E3 (RF01): SFN + SQS + DLQ + Dispatcher Lambda + IAM.
module "subscriptions" {
  source = "./subscriptions"

  backend_url = var.subscriptions_backend_url
  tick_secret = var.subscriptions_tick_secret
}
