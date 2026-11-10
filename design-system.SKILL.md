---
name: ecstay-design-system
description: Apply ECStay's brand identity, colour palette, typography and design tokens when building any UI for the ECStay boarding house search site (havnph.com). Use this skill when building pages, components or layouts for ECStay, including listing cards, search filters, maps, landing pages and dashboards.
---

# ECStay Design System

ECStay (Explore, Come, Stay) is a boarding house, bedspace and room finder for students and young workers in Davao City, Philippines. The brand should feel like a calm, premium stay brand: warm ivory pages, one deep colour, one metallic accent, a serif for headlines. Kapi the capybara is the ECStay concierge.

## Brand Identity

- **Product name**: ECStay (always written with E, C and S capitalised)
- **Line**: "Explore. Come. Stay." (English in every language)
- **Target users**: students near UM, AdDU, USeP, SPC, HCDC, and young workers near malls, hospitals and offices
- **Tone**: calm, warm, helpful. Premium, never stiff.
- **Logo**: `assets/brand/ecstay-mark.svg` (an arched doorway looking out at Mt Apo and the sun) + the wordmark "ECStay" in Newsreader 600, evergreen. On dark backgrounds use `ecstay-mark-light.svg` and an ivory wordmark.

## Color Palette

Always use the CSS variables at the top of `assets/css/havn.css`:

```css
:root {
  --evergreen:      #1D3F35;  /* Primary: buttons, links, map pins (Mt Apo forests) */
  --evergreen-dark: #132C25;  /* Hover */
  --evergreen-soft: #E6EDE8;  /* Tint backgrounds */
  --brass:          #B98B4E;  /* Accent: rules, icons, decoration (golden hour) */
  --brass-text:     #8A6431;  /* Brass for small text: eyebrows, signatures (4.8:1 on ivory) */
  --page:           #F9F6F0;  /* Ivory page background */
  --linen:          #EFE8DC;  /* Section bands, cards */
  --linen-line:     #E2D8C7;
  --text:           #17221D;  /* Ink */
  --ink-2:          #3C443F;
  --muted:          #666C66;
  --border:         #E4DDD0;
  --foot:           #1C2A21;  /* Footer, matches the grass in the closing scene */
  --sky:            #F3E5D2;  /* Top of the closing scene picture */
}
```

Older token names (`--blue`, `--navy`, `--kapi`, `--sand`) are kept and point at these colours.

**DO NOT** use bright blue, purple gradients, neon colours or emoji/3D icons. Keep one accent (brass) per view.

## Typography

```css
:root {
  --font-serif:   'Newsreader', Georgia, serif;           /* Headlines, wordmark, section titles, Kapi's note */
  --font-display: 'Hanken Grotesk', system-ui, sans-serif; /* Buttons, labels, chips */
  --font-body:    'Hanken Grotesk', system-ui, sans-serif; /* Body text */
}
```

- Headlines: Newsreader 500, letter-spacing -0.015em to -0.03em.
- Avoid template tells (Carl, 11 Nov: "looks AI generated"): no Fraunces/Instrument fonts, no spaced-out uppercase eyebrows with dashes, no italic accent word in a second colour.
- Prices and numbers stay in Instrument Sans.
- The home H1 is always the keyword sentence ("Boarding houses, bedspaces and rooms for rent in Davao City"). The line "Explore. Come. Stay." is the closing scene's headline.

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
- Price badge top-left: `₱X,XXX/mo` in `--evergreen`
- Availability dot: green/amber/red with label
- Title: boarding house name, `font-weight: 600`
- 2–3 amenity chips (WiFi, CR included, etc.)
- "View details" on hover as an overlay button
- University distance tag: e.g. "5 min from UM"

### Filter Pills
- Horizontal scroll on mobile
- Active: `background: --evergreen`, white text
- Inactive: `background: --surface`, `--text`
- Border radius: `--radius-xl` (pill shape)

### Price Range Slider
- Two-handle range input
- Display: `₱1,000 — ₱10,000+`
- Track color: `--evergreen`

### Search Bar
- Full width, prominent
- Placeholder: "Search by location or university..."
- Icon: magnifying glass left-aligned inside input
- Focus ring: `0 0 0 3px rgba(29,63,53,0.25)`

### University Badges
Use abbreviated names: UM, AdDU, USEP, SPC, HCDC
Color: `--evergreen-soft` background, `--evergreen` text

## Mobile-First Rules

Most ECStay users are on mobile (students browsing on data). Always:
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
