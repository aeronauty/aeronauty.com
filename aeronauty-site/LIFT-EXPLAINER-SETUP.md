# LiftExplainer Integration Setup

## Problem
The LiftExplainer app is a git submodule located at `submodules/LiftExplainer/`, but Next.js cannot serve symlinked files from the `public` directory for security reasons.

## Solution
The LiftExplainer files are **copied** (not symlinked) from the submodule to `public/lift-explainer/` so Next.js can serve them as static files.

## Setup Instructions

### First Time Setup
After cloning the repository:

```bash
# Initialize and update git submodules
git submodule update --init --recursive

# Sync LiftExplainer files to public directory
npm run sync-lift-explainer

# Start development server
npm run dev
```

### Updating LiftExplainer
When the LiftExplainer submodule is updated:

```bash
# Pull latest changes in submodule
cd submodules/LiftExplainer
git pull origin main
cd ../..

# Sync updated files to public directory
npm run sync-lift-explainer
```

## File Structure
- `submodules/LiftExplainer/` - Git submodule (source of truth)
- `public/lift-explainer/` - Copied files (ignored by git, served by Next.js)

## Important Notes
1. `public/lift-explainer/` is in `.gitignore` - don't commit these files
2. The submodule at `submodules/LiftExplainer/` is the source of truth
3. Run `npm run sync-lift-explainer` whenever the submodule is updated
4. The app is accessible at `/apps/panel-code` which loads `/lift-explainer/` in an iframe

## Access
- Development: http://localhost:3000/apps/panel-code
- The iframe loads: /lift-explainer/ (served from public directory)

