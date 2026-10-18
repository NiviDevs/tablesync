#!/usr/bin/env bash
# Source this file so callers inherit the pinned tool PATH.
tool_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$tool_root/versions.env"
tool_bin="$tool_root/.local/bin"
mkdir -p "$tool_bin"
export PATH="$tool_bin:$PATH"
for tool in minikube kubectl; do
  command -v "$tool" >/dev/null 2>&1 && continue
  [[ "$(uname -s)-$(uname -m)" == Linux-x86_64 ]] || { echo "Install $tool manually for this host; automatic download supports Linux x86_64." >&2; return 1; }
  case "$tool" in
    minikube) url="https://storage.googleapis.com/minikube/releases/$MINIKUBE_VERSION/minikube-linux-amd64";;
    kubectl) url="https://dl.k8s.io/release/$KUBECTL_VERSION/bin/linux/amd64/kubectl";;
  esac
  if [[ -f "/tmp/tablesync-$tool" && -f "/tmp/tablesync-$tool.sha256" ]]; then
    cp "/tmp/tablesync-$tool" "$tool_bin/$tool"
    cp "/tmp/tablesync-$tool.sha256" "$tool_bin/$tool.sha256"
  else
    curl --fail --location --retry 3 "$url" -o "$tool_bin/$tool.download"
    curl --fail --location --retry 3 "$url.sha256" -o "$tool_bin/$tool.sha256"
    mv "$tool_bin/$tool.download" "$tool_bin/$tool"
  fi
  printf '%s  %s\n' "$(awk '{print $1}' "$tool_bin/$tool.sha256")" "$tool_bin/$tool" | sha256sum --check --status || { echo "$tool checksum failed" >&2; return 1; }
  chmod +x "$tool_bin/$tool"
done
