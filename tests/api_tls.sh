#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
openssl req -x509 -newkey rsa:2048 -noenc -days 1 -subj /CN=localhost \
  -addext 'subjectAltName=DNS:localhost' \
  -keyout "$temp_dir/server-key.pem" -out "$temp_dir/server.pem" 2>"$temp_dir/keygen.log"
openssl pkcs12 -export -inkey "$temp_dir/server-key.pem" -in "$temp_dir/server.pem" \
  -passout pass:lab-only -out "$temp_dir/server.p12"
STUDIO_TEST_CA="$temp_dir/server.pem" STUDIO_TEST_PKCS12="$temp_dir/server.p12" \
  cargo test --manifest-path src-tauri/routeros/Cargo.toml api_ssl_validates_identity -- --ignored
