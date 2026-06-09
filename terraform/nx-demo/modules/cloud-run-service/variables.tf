variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
}

variable "location" {
  description = "Location/region for the Cloud Run service"
  type        = string
}

variable "image" {
  description = "Container image to deploy"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 8080
}

variable "cpu_limit" {
  description = "CPU limit for the container"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for the container"
  type        = string
  default     = "512Mi"
}

variable "min_instance_count" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instance_count" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "environment_variables" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "allow_public_access" {
  description = "Whether to allow public access to the service"
  type        = bool
  default     = true
}

variable "max_instance_request_concurrency" {
  description = "Maximum number of concurrent requests per instance (1 required for CPU < 1)"
  type        = number
  default     = 80
}

variable "cpu_always_allocated" {
  description = "Whether CPU should always be allocated (false = throttled when idle, cheaper for HTTP-only services)"
  type        = bool
  default     = false
}