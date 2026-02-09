module "app_3_git_tag" {
  source      = "../modules/data-git-tag"
  tag_pattern = "app-3@*"
}

locals {
  app_3_service_name         = "app-3"
  app_3_version_from_git_tag = module.app_3_git_tag.version
  app_3_version              = coalesce(var.app_3_version, local.app_3_version_from_git_tag)
  app_3_image_name           = "${var.google_region}-docker.pkg.dev/${data.google_project.current.project_id}/${data.google_artifact_registry_repository.docker_registry.repository_id}/apps-${local.app_3_service_name}"
}

module "app_3_service" {
  source = "../modules/cloud-run-service"

  service_name                     = local.app_3_service_name
  location                         = var.google_region
  image                            = "${local.app_3_image_name}:${local.app_3_version}"
  container_port                   = 8080
  cpu_limit                        = "250m"
  memory_limit                     = "128Mi"
  min_instance_count               = 0
  max_instance_count               = 3
  max_instance_request_concurrency = 1
  allow_public_access              = true
}

output "app_3_url" {
  description = "The URL of the Cloud Run service"
  value       = module.app_3_service.service_url
}
