terraform {
  
  backend "gcs" {
    bucket = "edissa-terraform-state"
    
  }
  
}
