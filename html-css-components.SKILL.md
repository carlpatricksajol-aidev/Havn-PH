---
name: html-css-components
description: Build production-grade, self-contained HTML/CSS/JS components and pages without a framework. Use this skill when the user asks to build HTML files, landing pages, static pages, or UI components using plain HTML, CSS, and vanilla JavaScript — including for the Havn boarding house platform. Produces clean, semantic, accessible markup with modern CSS.
---

# HTML / CSS / JS Component Standards

This skill governs how to write clean, modern, production-quality HTML, CSS, and vanilla JavaScript for frontend interfaces — especially for multi-page apps like Havn that are built file-by-file.

## HTML Standards

### Structure
- Always use semantic HTML5 elements: `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<aside>`
- Every page needs: `<!DOCTYPE html>`, `lang="en"`, `charset="UTF-8"`, viewport meta tag
- Use `<button>` for interactive actions, `<a>` for navigation
- Every `<img>` needs `alt` text and `loading="lazy"` for below-fold images
- Forms must have associated `<label>` for every input

### Accessibility
- Logical heading hierarchy: one `<h1>` per page, then `<h2>`, `<h3>`
- All interactive elements keyboard-accessible (focus styles must be visible)
- Color contrast: minimum 4.5:1 for normal text, 3:1 for large text
- ARIA labels on icon-only buttons: `aria-label="Filter listings"`
- Skip-to-content link at page top for keyboard users

### Template (every Havn page starts here)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="[Page description for SEO]">
  <title>[Page Title] — Havn</title>

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">

  <!-- Styles -->
  <link rel="stylesheet" href="/css/tokens.css">   <!-- Design tokens / variables -->
  <link rel="stylesheet" href="/css/base.css">     <!-- Reset + global styles -->
  <link rel="stylesheet" href="/css/[page].css">   <!-- Page-specific styles -->
</head>
<body>
  <a href="#main" class="skip-link">Skip to main content</a>

  <header class="site-header">
    <!-- Nav here -->
  </header>

  <main id="main">
    <!-- Page content here -->
  </main>

  <footer class="site-footer">
    <!-- Footer here -->
  </footer>

  <script src="/js/[page].js" defer></script>
</body>
</html>
```

## CSS Standards

### File Organization
```
/css
  tokens.css      ← CSS custom properties (colors, spacing, fonts)
  base.css        ← Reset, body, typography defaults
  layout.css      ← Grid systems, containers, page structure
  components/
    card.css
    filter.css
    nav.css
    badge.css
    button.css
    form.css
  pages/
    browse.css
    listing.css
    landing.css
```

### CSS Custom Properties Pattern
```css
/* tokens.css — always define at :root */
:root {
  /* Import brand tokens from havn-design-system skill */
  --havn-blue: #0052CC;
  /* ... all tokens ... */

  /* Layout */
  --container-max: 1200px;
  --container-padding: clamp(1rem, 4vw, 2rem);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 400ms ease;
}
```

### Modern CSS Patterns to Use
- CSS Grid for page layout: `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));`
- CSS Flexbox for component internals
- `clamp()` for fluid typography: `font-size: clamp(1rem, 2.5vw, 1.25rem)`
- `gap` instead of margin tricks
- `:is()` and `:where()` for selector efficiency
- Custom properties for theming
- `@media (hover: hover)` for hover-only styles (avoids sticky hover on mobile)
- `scroll-behavior: smooth` on html element
- `aspect-ratio` for image containers

### Responsive Breakpoints
```css
/* Mobile-first — build base styles for 360px+, then enhance */
/* Tablet */
@media (min-width: 640px) { }
/* Desktop */
@media (min-width: 1024px) { }
/* Wide */
@media (min-width: 1280px) { }
```

### Animation Guidelines
```css
/* Always respect reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .card {
    transition: transform var(--transition-base), box-shadow var(--transition-base);
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
  }
}

/* Skeleton loader pattern */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}
```

## Vanilla JavaScript Patterns

### DOM Queries
```js
// Prefer these patterns:
const el = document.querySelector('#search-input');
const cards = document.querySelectorAll('.listing-card');

// Event delegation for dynamic lists
document.querySelector('.listings-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.listing-card');
  if (!card) return;
  // handle card click
});
```

### Filter Logic (for Havn browse page)
```js
// Filter state object — single source of truth
const filters = {
  university: null,    // 'UM' | 'AdDU' | 'USEP' | 'SPC' | 'HCDC'
  priceMin: 1000,
  priceMax: 10000,
  roomType: null,
  gender: null,        // 'male' | 'female' | 'mixed'
  available: false,
  amenities: new Set(),
};

function applyFilters(listings, filters) {
  return listings.filter(listing => {
    if (filters.university && listing.university !== filters.university) return false;
    if (listing.price < filters.priceMin || listing.price > filters.priceMax) return false;
    if (filters.available && !listing.available) return false;
    if (filters.gender && listing.gender !== filters.gender) return false;
    return true;
  });
}
```

### No Framework Rules
- Do NOT import React, Vue, or Angular for simple pages
- Use `<template>` element + `.content.cloneNode(true)` for repeating card patterns
- Store state in a plain JS object, re-render with a `render()` function
- Use `fetch()` with `async/await` for API calls
- Use `IntersectionObserver` for lazy loading images and scroll animations

## Performance Checklist
- [ ] Images use `loading="lazy"` and `width`/`height` attributes set
- [ ] Fonts use `display=swap` in Google Fonts URL
- [ ] CSS in `<head>`, JS at bottom of `<body>` or with `defer`
- [ ] No render-blocking third-party scripts
- [ ] Mobile first CSS (smallest payload for most users)
- [ ] `preconnect` for external domains (Google Fonts, map tiles)
