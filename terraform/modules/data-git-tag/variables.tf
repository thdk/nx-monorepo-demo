variable "tag_pattern" {
  description = "The pattern to match the git tag"
  type        = string
  default     = "*"
}

variable "versioning_scheme" {
  description = "The versioning scheme used for tags. Use 'semver' for semantic versioning (sorts by version:refname) or 'calendar' for date-based versions with non-numeric suffixes (sorts by tag creation date)."
  type        = string
  default     = "semver"

  validation {
    condition     = contains(["semver", "calendar"], var.versioning_scheme)
    error_message = "versioning_scheme must be either 'semver' or 'calendar'."
  }
}