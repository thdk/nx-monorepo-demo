data "google_project" "current" {}

data "google_artifact_registry_repository" "docker_registry" {
  location      = var.google_region
  repository_id = "docker-images"
}

module "app_1_git_tag" {
  source      = "../modules/data-git-tag"
  tag_pattern = "@thdk/app-1@*"
}

locals {
  service_name               = "app-1"
  app_1_version_from_git_tag = module.app_1_git_tag.version
  app_1_version              = coalesce(var.app_1_version, local.app_1_version_from_git_tag)
  image_name                 = "${var.google_region}-docker.pkg.dev/${data.google_project.current.project_id}/${data.google_artifact_registry_repository.docker_registry.repository_id}/${local.service_name}"
}

module "app_1_service" {
  source = "../modules/cloud-run-service"

  service_name                      = local.service_name
  location                          = var.google_region
  image                             = "${local.image_name}:${local.app_1_version}"
  container_port                    = 8080
  cpu_limit                         = "250m"
  memory_limit                      = "128Mi"
  min_instance_count                = 0
  max_instance_count                = 3
  max_instance_request_concurrency  = 1
  allow_public_access               = true
}

output "app_1_url" {
  description = "The URL of the Cloud Run service"
  value       = module.app_1_service.service_url
}
