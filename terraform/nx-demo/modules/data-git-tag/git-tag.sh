#!/bin/bash

# Read the input variables
pattern=$1
versioning_scheme=${2:-semver}

# Choose sort strategy based on versioning scheme
if [ "$versioning_scheme" = "calendar" ]; then
  sort_flag="--sort=-creatordate"
else
  sort_flag="--sort=-version:refname"
fi

# Run the Git command and capture the output
latest_tag=$(git tag -l "$pattern" $sort_flag --merged HEAD | head -n 1)

# Check if latest_tag is empty and set it to null if so
if [ -z "$latest_tag" ]; then
  latest_tag="null"
fi

# Get the version part after the @ symbol
latest_tag=${latest_tag##*@}

echo "{\"latest_tag\": \"$latest_tag\"}"