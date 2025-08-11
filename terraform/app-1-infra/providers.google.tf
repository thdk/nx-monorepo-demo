provider "google" {
  project = var.google_project_id
  region  = var.google_region

  default_labels = {
    "nx-project" = "app-1-infra"
  }
}
