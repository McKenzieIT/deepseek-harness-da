#!/bin/bash
# setup-da-profile.sh — Idempotent setup for dsh-data-agent profiles.
#
# Run after: first clone, upstream merge, or profile re-init.
# Safe to re-run: checks before modifying.
#
# Architecture:
#   dsh-data-agent = product capability layer (LLM-agnostic)
#   dsh-llm-dashscope = deployment LLM choice (AGA gateway, interchangeable)
#   agent-default-model = deployment config (which model to use)
#
# Composition at boot:
#   dsh-base → dsh-web-app/headless → dsh-data-agent → dsh-llm-dashscope → user patch
#   (base LLM)  (surface)              (data caps)      (AGA gateway)        (model)
#
# To use a different LLM provider:
#   1. Replace dsh-llm-dashscope with your provider plugin in the bundles list
#   2. Update agent-default-model in the profile's cordis.patch.yml
#   3. Store your API key via the web UI Models page or credentials CLI
#
# This script does NOT:
#   - Modify any upstream/dsh-owned file (additive-only principle)
#   - Install credentials (do that separately)
#   - Touch the repo source (only ~/.dsh/ profile configs)

set -euo pipefail

DA_BUNDLE="@deepseek-ai/dsh-data-agent"
LLM_PLUGIN="@deepseek-ai/dsh-llm-dashscope"
DEFAULT_PROVIDER="aga"
DEFAULT_MODEL="qwen3.7-max"

ensure_bundle() {
  local profile_pkg="$1"
  local bundle="$2"
  if grep -q "$bundle" "$profile_pkg" 2>/dev/null; then
    echo "  ✓ $bundle"
  else
    python3 -c "
import json
pkg = json.load(open('$profile_pkg'))
bundles = pkg.setdefault('dsh', {}).setdefault('profile', {}).setdefault('bundles', [])
if '$bundle' not in bundles:
    bundles.append('$bundle')
json.dump(pkg, open('$profile_pkg', 'w'), indent=2)
print('  ✅ $bundle added')
"
  fi
}

ensure_default_model() {
  local patch_file="$1"
  if grep -q "agent-default-model" "$patch_file" 2>/dev/null; then
    echo "  ✓ agent-default-model configured"
  else
    cat > "$patch_file" << PATCH
# Deployment-specific overrides. LLM default: AGA/DashScope.
# Change provider/model here when switching LLM backends.
- id: agent-default-model
  config:
    provider: $DEFAULT_PROVIDER
    model: $DEFAULT_MODEL
PATCH
    echo "  ✅ agent-default-model → $DEFAULT_PROVIDER/$DEFAULT_MODEL"
  fi
}

setup_profile() {
  local name="$1"
  local dir="$HOME/.dsh/profiles/$name"
  local pkg="$dir/package.json"
  local patch="$dir/cordis.patch.yml"

  echo "[$name]"
  if [ ! -f "$pkg" ]; then
    echo "  ⚠ Profile not initialized. Run 'pnpm dsh $name' once first."
    return
  fi
  ensure_bundle "$pkg" "$DA_BUNDLE"
  ensure_bundle "$pkg" "$LLM_PLUGIN"
  ensure_default_model "$patch"
  echo ""
}

echo "═══ dsh-data-agent profile setup ═══"
echo ""
setup_profile "web"
setup_profile "headless"
echo "Done. Boot with: pnpm dsh web"
echo "Default LLM: $DEFAULT_PROVIDER/$DEFAULT_MODEL (DashScope via AGA)"
