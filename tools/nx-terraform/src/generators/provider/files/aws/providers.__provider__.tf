
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      "nx:project" = "<%= project %>"
    }
  }
}
