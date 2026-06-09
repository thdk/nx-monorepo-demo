module "node_nest_webpack_git_tag" {
  source            = "../modules/data-git-tag"
  tag_pattern       = "node-nest-webpack@*"
  versioning_scheme = "calendar"
}

locals {
  node_nest_webpack_service_name         = "node-nest-webpack"
  node_nest_webpack_version_from_git_tag = module.node_nest_webpack_git_tag.version
  node_nest_webpack_version              = coalesce(var.node_nest_webpack_version, local.node_nest_webpack_version_from_git_tag)
  node_nest_webpack_image_name           = "${var.google_region}-docker.pkg.dev/${data.google_project.current.project_id}/${data.google_artifact_registry_repository.docker_registry.repository_id}/apps-${local.node_nest_webpack_service_name}"
}

module "node_nest_webpack_service" {
  source = "../modules/cloud-run-service"

  service_name                     = local.node_nest_webpack_service_name
  location                         = var.google_region
  image                            = "${local.node_nest_webpack_image_name}:${local.node_nest_webpack_version}"
  container_port                   = 8080
  cpu_limit                        = "250m"
  memory_limit                     = "128Mi"
  min_instance_count               = 0
  max_instance_count               = 3
  max_instance_request_concurrency = 1
  allow_public_access              = true
}

output "node_nest_webpack_url" {
  description = "The URL of the Cloud Run service"
  value       = module.node_nest_webpack_service.service_url
}
