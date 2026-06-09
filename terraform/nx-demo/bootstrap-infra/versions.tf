terraform {
  required_version = "1.12.1"

  required_providers {

    google = {
      source  = "hashicorp/google"
      version = "~> 6.4.0"
    }

  }
}
