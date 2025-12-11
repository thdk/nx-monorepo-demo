
data "external" "latest_tag" {
  program = ["bash", "${path.module}/git-tag.sh", var.tag_pattern]
}


output "version" {
  value = data.external.latest_tag.result.latest_tag != "null" ? data.external.latest_tag.result.latest_tag : null
}
