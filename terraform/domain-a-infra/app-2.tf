module "app_2_git_tag" {
  source      = "../modules/data-git-tag"
  tag_pattern = "app-2@*"
}

locals {
  app_2_service_name         = "app-2"
  app_2_version_from_git_tag = module.app_2_git_tag.version
  app_2_version              = coalesce(var.app_2_version, local.app_2_version_from_git_tag)
  app_2_image_name           = "${var.google_region}-docker.pkg.dev/${data.google_project.current.project_id}/${data.google_artifact_registry_repository.docker_registry.repository_id}/apps-${local.app_2_service_name}"
}

module "app_2_service" {
  source = "../modules/cloud-run-service"

  service_name                     = local.app_2_service_name
  location                         = var.google_region
  image                            = "${local.app_2_image_name}:${local.app_2_version}"
  container_port                   = 8080
  cpu_limit                        = "250m"
  memory_limit                     = "128Mi"
  min_instance_count               = 0
  max_instance_count               = 3
  max_instance_request_concurrency = 1
  allow_public_access              = true
}

output "app_2_url" {
  description = "The URL of the Cloud Run service"
  value       = module.app_2_service.service_url
}
