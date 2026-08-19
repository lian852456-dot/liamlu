#!/bin/bash
set -euo pipefail

readonly tool_dir="$(cd "$(dirname "$0")" && pwd)"
exec node "$tool_dir/outlook_bridge_host_adapter.mjs" --formal "$@"
