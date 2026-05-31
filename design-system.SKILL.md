---
name: havn-design-system
description: Apply Havn's brand identity, color palette, typography, and design tokens when building any UI for the Havn boarding house search app. Use this skill when building pages, components, or layouts for Havn (havnph.com / browse.havnph.com) — including listing cards, search filters, maps, landing pages, and dashboards.
---

# Havn Design System

Havn is a boarding house search platform for students and young professionals in Davao City, Philippines. The brand is trustworthy, clean, and approachable — a place that feels like home before you find one.

## Brand Identity

- **Product name**: Havn (pronounced "haven")
- **Tagline**: "Find your haven in Davao City"
- **Target users**: Students near UM, AdDU, USEP, SPC, HCDC — and young workers
- **Tone**: Calm, helpful, Filipino-warm. Not corporate. Not cluttered.
- **Feel**: The app should feel like a reliable kuya/ate recommending a boarding house — trustworthy, local, and genuinely useful.

## Color Palette

Always use CSS variables. Reference this system:

```css
:root {
  /* Brand */
  --havn-blue:        #0052CC;  /* Primary — headers, CTAs, links */
  --havn-blue-dark:   #003A99;  /* Hover state */
  --havn-blue-light:  #E6EFFE;  /* Subtle tint backgrounds */

  /* Neutrals */
  --havn-white:       #FFFFFF;
  --havn-surface:     #F7F8FA;  /* Page background */
  --havn-card:        #FFFFFF;  /* Card background */
  --havn-border:      #E0E4ED;  /* Borders, dividers */
  --havn-muted:       #6B7280;  /* Secondary text */
  --havn-text:        #111827;  /* Primary text */

  /* Status */
  --havn-green:       #16A34A;  /* Available now badge */
  --havn-amber:       #D97706;  /* Limited availability */
  --havn-red:         #DC2626;  /* Fully booked */

  /* Accent */
  --havn-warm:        #FFF7ED;  /* Warm fill for featured cards */
  --havn-warm-border: #FED7AA;  /* Orange accent for featured */
}
```

**DO NOT** use purple gradients, dark navy backgrounds for the main UI, or neon colors. Havn is day-use — students browse it on mobile in bright sunlight.

## Typography

```css
/* Import in <head> */
/* @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500&display=swap'); */

:root {
  --font-display: 'Plus Jakarta Sans', sans-serif;  /* Headings, logo, CTAs */
  --font-body:    'DM Sans', sans-serif;             /* Body text, labels */
}

/* Scale */
/* h1: 2rem / 700 — page titles */
/* h2: 1.5rem / 600 — section headers */
/* h3: 1.125rem / 600 — card titles */
/* body: 0.9375rem / 400 — default reading text */
/* label: 0.8125rem / 500 — filter labels, badges */
/* caption: 0.75rem / 400 — metadata, timestamps */
```

**Never use**: Inter, Roboto, Arial, system-ui as primary font. Havn has a brand — use it.

## Spacing & Layout

```css
:root {
  --radius-sm:  6px;
  --radius-md:  10px;
  --radius-lg:  16px;
  --radius-xl:  24px;

  --shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-hover: 0 4px 12px rgba(0,82,204,0.12);

  --spacing-section: 3rem;
  --spacing-card-gap: 1rem;
}
```

## Component Patterns

### Listing Card
- Photo thumbnail (16:9 ratio, `object-fit: cover`)
- Price badge top-left: `₱X,XXX/mo` in `--havn-blue`
- Availability dot: green/amber/red with label
- Title: boarding house name, `font-weight: 600`
- 2–3 amenity chips (WiFi, CR included, etc.)
- "View details" on hover as an overlay button
- University distance tag: e.g. "5 min from UM"

### Filter Pills
- Horizontal scroll on mobile
- Active: `background: --havn-blue`, white text
- Inactive: `background: --havn-surface`, `--havn-text`
- Border radius: `--radius-xl` (pill shape)

### Price Range Slider
- Two-handle range input
- Display: `₱1,000 — ₱10,000+`
- Track color: `--havn-blue`

### Search Bar
- Full width, prominent
- Placeholder: "Search by location or university..."
- Icon: magnifying glass left-aligned inside input
- Focus ring: `0 0 0 3px rgba(0,82,204,0.2)`

### University Badges
Use abbreviated names: UM, AdDU, USEP, SPC, HCDC
Color: `--havn-blue-light` background, `--havn-blue` text

## Mobile-First Rules

Most Havn users are on mobile (students browsing on data). Always:
- Build mobile layout first, then desktop
- Minimum tap target: 44×44px
- Card grid: 1 column mobile → 2 columns tablet → 3 columns desktop
- Bottom navigation on mobile (Browse, Map, Saved, Account)
- Sticky search bar at top on browse page
- Filter panel: full-screen modal on mobile, sidebar on desktop

## DO / DON'T

| DO | DON'T |
|----|-------|
| Use ₱ for prices (Philippine peso) | Use $ or USD |
| Show university proximity in minutes | Show raw GPS coordinates |
| Use Filipino-friendly language | Use overly formal or corporate copy |
| Show real amenity chips (WiFi, CR, kitchen) | Generic "amenities available" text |
| Mobile-first, thumb-friendly layouts | Desktop-only designs |
| Clean white cards with subtle shadows | Dark mode as default |
| Skeleton loaders while listings load | Spinners blocking the whole page |
