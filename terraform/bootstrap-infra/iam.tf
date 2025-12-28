resource "google_iam_workload_identity_pool" "example" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions Pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.example.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions Provider"
  description                        = "GitHub Actions identity pool provider for CI/CD"
  disabled                           = false
  attribute_condition                = <<EOT
assertion.repository_owner_id == "4201102" &&
attribute.repository == "thdk/nx-monorepo-demo"
EOT
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.aud"        = "assertion.aud"
    "attribute.repository" = "assertion.repository"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

output "github_identity_provider_name" {
  value = google_iam_workload_identity_pool_provider.github.name
}

resource "google_project_iam_custom_role" "cicd_role" {
  role_id     = "cicdRole"
  title       = "CI/CD Role"
  description = "A role for CI/CD operations used by GitHub Actions"
  permissions = [
    "storage.objects.create",
    "storage.objects.get",
    "storage.objects.delete",
    "storage.objects.list",
    "iam.serviceAccounts.get",
    "iam.serviceAccounts.list",
    "iam.serviceAccounts.getAccessToken",
    "iam.roles.get",
    "iam.workloadIdentityPools.get",
    "iam.workloadIdentityPoolProviders.get",
    "resourcemanager.projects.get",
    "resourcemanager.projects.getIamPolicy",
    "serviceusage.services.enable",
    "serviceusage.services.get",
    "serviceusage.services.list",
    "artifactregistry.repositories.create",
    "artifactregistry.repositories.get",
    "artifactregistry.repositories.list",
    "artifactregistry.repositories.uploadArtifacts",
    "artifactregistry.dockerimages.get",
    "artifactregistry.dockerimages.list",
    "artifactregistry.files.upload",
    "artifactregistry.files.get",
    "artifactregistry.files.list",
    "artifactregistry.versions.get",
    "artifactregistry.versions.list",
    "artifactregistry.tags.get",
    "artifactregistry.tags.list",
    "artifactregistry.tags.create",
    "artifactregistry.tags.update",
    "artifactregistry.repositories.downloadArtifacts",
    "run.services.get",
    "run.services.update",
    "iam.serviceAccounts.actAs",
    "run.operations.get"
  ]
}

locals {
  cicd_roles = [
    google_project_iam_custom_role.cicd_role.id,
  ]
  developers = [
    "user:thomas@edissa.dev",
  ]
}
resource "google_project_iam_member" "github_actions_pool" {
  for_each = toset(local.cicd_roles)
  project  = data.google_project.current.project_id
  role     = each.key
  member   = "principalSet://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.example.workload_identity_pool_id}/attribute.repository/thdk/nx-monorepo-demo"
}

/**
  * Github actions doesn't need a service account to authenticate since it uses direct workload identity federation.
  * However, sometimes we want to run CI/CD tasks locally and for that we can impersonate the service account that has the required permissions.
*/
resource "google_service_account" "cicd_service_account" {
  account_id   = "cicd-user"
  display_name = "CICD Service Account"
  project      = data.google_project.current.project_id
}

resource "google_project_iam_member" "cicd_service_account_role" {
  for_each = toset(local.cicd_roles)
  project  = data.google_project.current.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.cicd_service_account.email}"
}

/**
  * Grant Service Account Token Creator role on the cicd service account to developers.
  * This allows developers to impersonate the cicd service account.
*/
resource "google_service_account_iam_member" "cicd_impersonation" {
  for_each           = toset(local.developers)
  service_account_id = google_service_account.cicd_service_account.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.key
}
