#!/bin/bash
# ============================================================
# Spine Scanner — Week 1-2 Beta Deployment Script
# Repo: github.com/hondoentertainment/spine-scanner
# Stack: React 19.2 + TypeScript 5.9 + Vite 7 + Zustand 5 + Supabase
# Run from project root: bash deploy-spine-scanner-beta.sh
# ============================================================

set -e  # Exit on any error

echo "🔍 Pre-flight checks..."

# 1. Verify we're in the right repo
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Run from project root."
  exit 1
fi

# 2. Check required env vars are set
echo "Checking environment variables..."
if [ -z "$VITE_POSTHOG_KEY" ]; then
  echo "⚠️  WARNING: VITE_POSTHOG_KEY is not set. Analytics will not fire."
  echo "   Set it in Vercel dashboard: Settings → Environment Variables"
fi
if [ -z "$VITE_SUPABASE_URL" ]; then
  echo "⚠️  WARNING: VITE_SUPABASE_URL is not set."
fi
if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "⚠️  WARNING: VITE_SUPABASE_ANON_KEY is not set."
fi

# 3. Install dependencies (important if package.json changed)
echo "📦 Installing dependencies..."
npm install

# 4. Verify build passes before committing
echo "🔨 Running production build..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed. Fix errors before committing."
  exit 1
fi
echo "✅ Build passed."

# 5. Run type check
echo "🔎 Running TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found. Fix before committing."
  exit 1
fi
echo "✅ TypeScript clean."

# 6. Show current git status
echo "📋 Current git status:"
git status

# 7. Create feature branch
BRANCH="feature/beta-week1-2"
echo "🌿 Creating branch: $BRANCH"
git checkout -b $BRANCH 2>/dev/null || git checkout $BRANCH

# ============================================================
# COMMIT 1: Package dependencies (do this first)
# ============================================================
echo "📦 Committing package updates..."
git add package.json package-lock.json
git commit -m "chore: add Week 1-2 beta dependencies

- posthog-js for analytics
- vite-plugin-pwa for PWA support
- Updated React 19.2, TypeScript 5.9, Vite 7" 2>/dev/null || echo "No package changes to commit."

# ============================================================
# COMMIT 2: Infrastructure & Routing Fix
# ============================================================
echo "🔧 Committing routing fix..."
git add vercel.json src/App.tsx
git commit -m "fix: resolve client-side routing for SPA on Vercel

- Add vercel.json with rewrite rules for React Router
- Fix App.tsx route definitions
- 404 fallback to index.html" 2>/dev/null || echo "No routing changes to commit."

# ============================================================
# COMMIT 3: Instagram Story Export
# ============================================================
echo "📸 Committing Instagram export..."
git add src/components/export/ src/hooks/useInstagramExport.ts src/utils/exportHelpers.ts 2>/dev/null
git commit -m "feat: add Instagram story export (1080x1920)

- Canvas-based story rendering
- PNG download and share flow
- useInstagramExport hook" 2>/dev/null || echo "No export changes to commit."

# ============================================================
# COMMIT 4: Analytics (PostHog)
# ============================================================
echo "📊 Committing analytics..."
git add src/utils/posthog.ts src/components/analytics/ src/hooks/useAnalytics.ts src/stores/analyticsStore.ts src/main.tsx 2>/dev/null
git commit -m "feat: integrate PostHog analytics

- PostHog init with VITE_POSTHOG_KEY
- Track scan_completed, export_triggered, onboarding events
- Privacy-respecting opt-out support" 2>/dev/null || echo "No analytics changes to commit."

# ============================================================
# COMMIT 5: Onboarding Flow
# ============================================================
echo "🎯 Committing onboarding flow..."
git add src/components/onboarding/ src/hooks/useOnboarding.ts src/stores/onboardingStore.ts 2>/dev/null
git commit -m "feat: add first-run onboarding flow

- Multi-step modal with progress
- Zustand persistence (skippable, resumable)
- Steps: welcome, scan, export, analytics consent" 2>/dev/null || echo "No onboarding changes to commit."

# ============================================================
# COMMIT 6: PWA Install Prompt
# ============================================================
echo "📱 Committing PWA features..."
git add src/components/pwa/ src/hooks/usePWAInstall.ts public/manifest.json public/sw.js index.html 2>/dev/null
git commit -m "feat: PWA install prompt and service worker

- Smart install prompt timing
- manifest.json with icons and theme
- Service worker for offline support
- iOS PWA meta tags" 2>/dev/null || echo "No PWA changes to commit."

# ============================================================
# COMMIT 7: Performance Tuning
# ============================================================
echo "⚡ Committing performance optimizations..."
git add vite.config.ts src/utils/performanceUtils.ts 2>/dev/null
git commit -m "perf: optimize bundle splitting and load performance

- Manual chunk splitting (vendor, ui, analytics)
- Lazy load heavy components
- vite-plugin-pwa asset caching
- Target: <200KB initial bundle" 2>/dev/null || echo "No perf changes to commit."

# ============================================================
# PUSH TO REMOTE
# ============================================================
echo "🚀 Pushing to GitHub..."
git push -u origin $BRANCH

# ============================================================
# TAG THE BETA MILESTONE
# ============================================================
echo "🏷️  Tagging beta milestone..."
git tag -a v0.2.0-beta -m "Week 1-2 beta: routing, export, analytics, onboarding, PWA, perf"
git push origin v0.2.0-beta

# ============================================================
# POST-DEPLOYMENT REMINDERS
# ============================================================
echo ""
echo "============================================================"
echo "✅ PUSH COMPLETE — Next steps:"
echo "============================================================"
echo ""
echo "1. Open PR on GitHub:"
echo "   https://github.com/hondoentertainment/spine-scanner/compare/feature/beta-week1-2"
echo ""
echo "2. Verify Vercel build:"
echo "   https://vercel.com/hondoentertainment/spine-scanner"
echo ""
echo "3. Set env vars in Vercel (if not already set):"
echo "   VITE_POSTHOG_KEY"
echo "   VITE_SUPABASE_URL"
echo "   VITE_SUPABASE_ANON_KEY"
echo ""
echo "4. After deploy, verify:"
echo "   - App loads without 404 on refresh"
echo "   - Onboarding modal fires on first visit"
echo "   - Instagram export downloads 1080x1920 PNG"
echo "   - PostHog dashboard shows events"
echo "   - PWA install prompt appears on mobile"
echo ""
echo "5. Rollback if needed:"
echo "   vercel.com → Deployments → Promote previous build"
echo "   OR: git revert HEAD && git push origin main"
echo ""
echo "🎉 Spine Scanner Week 1-2 Beta deployed!"
