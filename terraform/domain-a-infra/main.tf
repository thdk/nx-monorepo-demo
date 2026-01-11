data "google_project" "current" {}

data "google_artifact_registry_repository" "docker_registry" {
  location      = var.google_region
  repository_id = "docker-images"
}
