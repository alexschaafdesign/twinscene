#!/usr/bin/env bash
set -e

# Deploy the Apps Script project: push the latest source, then create a new
# versioned deployment. Runs from the repo's apps-script/ directory regardless
# of where the script is invoked from.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../apps-script"

MESSAGE="${1:-Deploy update}"

clasp push
clasp deploy \
  --deploymentId AKfycbyPPOcLphriGmOMIBxiqnltSqpmYagLXhF3OXR2IV62KbKUQ-glHGkwtAuPhUlyV318MA \
  --description "$MESSAGE"
