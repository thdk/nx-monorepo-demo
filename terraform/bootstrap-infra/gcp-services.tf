locals {
  services = [
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com"
  ]
}

resource "google_project_service" "enable_services" {
  for_each = toset(local.services)
  service  = each.value
}
