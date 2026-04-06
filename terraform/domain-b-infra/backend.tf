terraform {

  backend "gcs" {
    bucket = "edissa-tf-state"

  }

}
