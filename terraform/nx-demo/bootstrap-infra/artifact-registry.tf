resource "google_artifact_registry_repository" "docker_registry" {
  location      = var.google_region
  repository_id = "docker-images"
  description   = "Docker container images for applications managed in this repository"
  format        = "DOCKER"

  depends_on = [google_project_service.enable_services]
}

output "artifact_registry_url" {
  description = "The URL of the Artifact Registry repository for Docker images"
  value       = "${var.google_region}-docker.pkg.dev/${data.google_project.current.project_id}/${google_artifact_registry_repository.docker_registry.repository_id}"
}