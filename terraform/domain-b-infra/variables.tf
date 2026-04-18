
variable "configuration" {
  type        = string
  description = "Configuration name (e.g. development, production)"
  default     = "development"

  validation {
    condition     = contains(["development", "production"], var.configuration)
    error_message = "Configuration name must be one of: development, production"
  }
}

variable "node_nest_webpack_version" {
  type        = string
  description = "Version of the node-nest-webpack docker image that needs to be used for deployment. If not provided the latest git tag matching node-nest-webpack@{version} will be used."
  default     = null
}
