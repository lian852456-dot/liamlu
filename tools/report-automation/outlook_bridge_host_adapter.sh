#!/bin/zsh
set -euo pipefail

readonly tool_dir="${0:A:h}"
exec node "$tool_dir/outlook_bridge_host_adapter.mjs" --formal "$@"
