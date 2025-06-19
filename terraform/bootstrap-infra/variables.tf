
variable "configuration" {
  type        = string
  description = "Configuration name (e.g. development, production)"
  default     = "development"

  validation {
    condition     = contains(["development", "production"], var.configuration)
    error_message = "Configuration name must be one of: development, production"
  }
}
