
variable "configuration" {
  type        = string
  description = "Configuration name (e.g. development, production)"
  default     = "development"

  validation {
    condition     = contains(["development", "production"], var.configuration)
    error_message = "Configuration name must be one of: development, production"
  }
}

variable "app_1_version" {
  type        = string
  description = "Version of the app-1 docker image that needs to be used for deployment. If not provided the latest git tag matching @thdk/app-1@{version} will be used."
  default     = null
}
