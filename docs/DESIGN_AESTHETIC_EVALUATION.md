# Design aesthetic evaluation — SpineScanner

**Goal:** Align visual and interaction quality with **~90th percentile** of competitive consumer / utility apps (book libraries, fintech-lite, productivity PWA tier).  
**Date:** 2026-03-11  

---

## 1. Competitive design bar (what “top 10%” means)

We’re not comparing to bespoke native-only apps with unlimited art budget. The reference set is:

- **Strong PWA / web apps:** Linear (web), Notion, Vercel Dashboard patterns  
- **Category peers (library / reading):** Libib, modern Bookshelf-style UIs, *recent* Goodreads mobile web (functional but not leading)  
- **Baseline:** Generic Bootstrap / unstyled forms = ~30–40th percentile  

**90th percentile** here means:

- Coherent **color system** (light/dark), clear hierarchy  
- **Typography** with a real text face, comfortable line length and scale  
- **Consistent radius, elevation, and spacing** (not arbitrary per screen)  
- **Motion** that respects `prefers-reduced-motion`  
- **Touch-first** targets and safe areas on phones  
- **Accessibility** focus rings and contrast in the AA ballpark  

---

## 2. Rubric (0–10)

| Dimension | Weight | Before audit | After token + font pass* | Notes |
|-----------|--------|--------------|---------------------------|--------|
| Typography & hierarchy | ×1.2 | 7.0 | **8.0** | Inter was referenced but not loaded; fluid type limited |
| Color & theme (light/dark) | ×1.2 | 8.0 | **8.5** | `color-scheme` helps native controls |
| Layout & spacing rhythm | ×1.0 | 7.5 | **8.0** | Good max-width; tokens reduce drift |
| Components (cards, glass, nav) | ×1.2 | 7.5 | **8.2** | Shared `--radius-*`, `--shadow-*` on `.glass` |
| Motion & micro-interactions | ×1.0 | 6.5 | **7.5** | Scanner scan line: reduced-motion guard added globally |
| Mobile / PWA polish | ×1.2 | 8.0 | **8.5** | Bottom nav + safe area already strong |
| Accessibility (focus, contrast) | ×1.2 | 7.5 | **8.0** | Focus-visible global; spot-check Library/Scanner per screen |
| Brand / distinctiveness | ×0.8 | 7.5 | **7.8** | Indigo + glass is recognizable; avoid generic “AI slop” purple gradient cliché overload |

\* *Incremental improvements in `index.html` + `index.css` (this commit).*

**Weighted approximate score:** ~**7.6 → 8.2 / 10** (between **~80th and ~90th** percentile for a small-team PWA).  

**Post–roadmap wave (library UX + theme chrome + tokens):** add **~+0.2–0.35** on *mobile patterns*, *accessibility*, and *system integration* (not full visual redesign). “**95th percentile**” is **not objectively measurable** — treat it as *stretch* until empty-state art, motion brief, and contrast audit are done.

To **sustain** true 90th percentile long term:

1. **Component audit** — align `BookCard`, `BookDetail`, `Scanner` modules to the same radius/shadow tokens.  
2. **Light theme `theme-color`** — update meta or use a small script to match `data-theme` (Safari tab bar).  
3. **Illustration / empty states** — custom empty-state art moves “brand” from 7.5 → 9.  
4. **Motion design brief** — one shared easing curve and max 200–300ms for UI transitions.  

---

## 3. Gaps vs. top-tier apps

| Gap | Severity | Remediation |
|-----|----------|-------------|
| Font not actually loaded (system fallback) | Medium | Google Fonts Inter + `font-display: swap` |
| No explicit design token layer | Medium | CSS variables: radius, shadow, duration |
| `theme-color` static dark | Low | Dynamic meta or document in backlog |
| Heavy use of glass + blur on low-end Android | Low | Optional `prefers-reduced-transparency` (future) |
| Per-module CSS may diverge | Medium | Gradually import shared tokens or `@layer` |

---

## 4. Checklist before claiming “90% competitive”

- [x] Primary font loads with swap  
- [x] Shared radii + elevation tokens  
- [x] `color-scheme` on `:root` / themes  
- [x] Reduced motion reduces global decorative animation  
- [ ] All routes pass quick contrast spot-check (light + dark)  
- [ ] Empty states use consistent illustration/iconography  
- [ ] E2E screenshot baseline for visual regression (optional)  

---

## 5. Related files

- `src/index.css` — tokens, `glass`, global focus, safe area  
- `src/components/App.module.css` — shell, nav, marketing  
- `index.html` — font preconnect + stylesheet  
- `docs/FEATURE_ROADMAP.md` — B8 accessibility sweep ties here  
