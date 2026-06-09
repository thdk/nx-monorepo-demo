resource "google_cloud_run_v2_service" "service" {
  name                 = var.service_name
  location             = var.location
  deletion_protection  = false
  invoker_iam_disabled = var.allow_public_access

  template {
    max_instance_request_concurrency = var.max_instance_request_concurrency
    
    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        cpu_idle = !var.cpu_always_allocated
      }

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }
    }

    scaling {
      min_instance_count = var.min_instance_count
      max_instance_count = var.max_instance_count
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}

# Note: Public access is controlled via invoker_iam_disabled = true
# IAM binding for public access (alternative approach - not used when invoker_iam_disabled = true)
# resource "google_cloud_run_v2_service_iam_member" "public_access" {
#   count    = var.allow_public_access ? 1 : 0
#   name     = google_cloud_run_v2_service.service.name
#   location = google_cloud_run_v2_service.service.location
#   role     = "roles/run.invoker"
#   member   = "allUsers"
# }