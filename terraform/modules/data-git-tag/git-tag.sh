#!/bin/bash

# Read the input variable
pattern=$1

# Run the Git command and capture the output
latest_tag=$(git tag -l "$pattern" --sort=-version:refname --merged HEAD | head -n 1)

# Check if latest_tag is empty and set it to null if so
if [ -z "$latest_tag" ]; then
  latest_tag="null"
fi

# Get the version part after the @ symbol
latest_tag=${latest_tag##*@}

echo "{\"latest_tag\": \"$latest_tag\"}"