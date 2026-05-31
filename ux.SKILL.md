---
name: boarding-house-ux
description: Apply UX best practices specific to a boarding house search platform in the Philippines. Use this skill when designing or building any feature of Havn — search, listing cards, filters, map view, listing detail page, landlord onboarding, or any user flow involving students and young professionals searching for boarding houses near universities in Davao City.
---

# Boarding House UX Patterns for Havn

Havn is NOT Airbnb or a hotel booking site. It's a boarding house (bedspace / room for rent) discovery platform built for Filipino students and young workers in Davao City. The UX must reflect this context exactly.

## Key User Contexts

### Student Searcher (primary user)
- Searching on mobile, often on limited data (Smart/Globe prepaid)
- Key questions: "Is it near my school?", "Can I afford ₱3,000/mo?", "Is it safe for a female student?"
- Compares 3–5 options before deciding
- Often searches with a friend or classmate
- Needs to show listing to parents for approval → share feature matters

### Young Worker (secondary user)
- Searching on mobile or desktop, after work hours
- Key questions: "Is it near my office?", "Is there WiFi?", "Can I cook?"
- More price-flexible than students
- Values privacy (single room preferred)

### Landlord (listing owner)
- Often 40–60 years old, moderate tech literacy
- Wants simple listing creation — photo upload, price, room count
- Needs to be reassured Havn is legitimate

## Page-by-Page UX Requirements

### Landing Page (havnph.com)
- Hero: Clear headline + search bar (location or university name)
- Trust signals: "Verified listings", "X boarding houses listed", "Serving UM, AdDU, USEP"
- How it works: 3 steps max — Search → Browse → Contact
- Featured listings: 3–6 cards from real properties
- For landlords CTA: separate but visible
- No pop-ups on first load

### Browse / Search Results Page (browse.havnph.com)
**Layout: Split view on desktop (map left, cards right), cards-only on mobile**

#### Search Bar
- Sticky at top (doesn't scroll away)
- Autocomplete: university names, barangays, landmarks
- Clear button (×) when text is entered

#### Filter Panel
- Mobile: Bottom sheet modal (slides up), "Apply filters" button
- Desktop: Left sidebar, filters apply instantly
- Filter groups:
  1. Available Now (toggle)
  2. Price Range (dual-handle slider, ₱1,000–₱10,000+)
  3. Nearest University (UM, AdDU, USEP, SPC, HCDC — multi-select chips)
  4. Room Type (Bedspace / Single room / Shared room)
  5. Gender Policy (Female only / Male only / Mixed)
  6. Amenities (WiFi, CR included, Kitchen, Laundry, Parking, AC)
- Active filter count badge on "Filters" button
- "Clear all filters" link when any filter is active

#### Listing Card
Required elements (in order):
1. Photo (16:9, lazy-loaded, skeleton while loading)
2. Price badge: `₱X,XXX/mo` — top-left overlay on photo
3. Availability dot + label: green "Available" / amber "Few slots" / red "Full"
4. Property name (bold)
5. University distance: "3 min walk from UM" or "5 min tricycle from AdDU"
6. Amenity chips: max 3 visible (WiFi, CR, Kitchen) + "+2 more" if overflow
7. Room type label
8. Save/heart button (top-right of card)

On hover (desktop): "View details" overlay button appears

Card states:
- Default: subtle shadow
- Hover: lift + stronger shadow + blue border
- Saved: heart filled (red)
- Fully booked: grayscale photo + "Full" banner

#### Empty State
When no results match filters:
- Illustration (not just text)
- "No boarding houses match your filters"
- Suggest: "Try removing the university filter" or "Expand price range"
- Show 3 nearby listings as fallback

### Listing Detail Page
Sections (in this order):
1. Photo gallery (swipeable on mobile, max 8 photos)
2. Price + availability status (prominent, above the fold)
3. Property name + address + university distance badge
4. Room types available (table: type, price, slots available)
5. Amenities grid (icon + label, 2–3 columns)
6. Rules (house rules, curfew, visitor policy)
7. About the location (map embed, nearby landmarks)
8. Landlord info (name, contact — phone/Messenger/Viber)
9. Similar listings (3 cards)

**Contact CTA**: Sticky bottom bar on mobile: "Contact Landlord" button (opens SMS/Messenger/Viber)

### Map View
- Cluster markers when zoomed out (show count)
- Single marker: shows price on hover/tap (`₱3,500`)
- Clicking marker: mini card popup with photo + price + "View" button
- University markers always visible (with school icon)
- My location button (if permission granted)
- Basemap: OpenStreetMap (free) — never require Google Maps API key

## UX Copy Conventions

- Prices always in Philippine peso: `₱3,500/mo` (not PHP, not $)
- Distance in Filipino context: "5 minuto sa tricycle" or "5 min by tricycle from UM"
- Use "boarding house" not "property", "apartment", or "rental"
- "Bedspace" for dormitory-style rooms
- Availability: "Available now", "Few slots left", "Fully booked" (not "In stock")
- Contact: "Contact Landlord" (not "Book now" — Havn doesn't process bookings)

## Mobile UX Essentials

- Bottom navigation bar: Browse, Map, Saved, Account (4 items max)
- Pull-to-refresh on listings grid
- Infinite scroll OR "Load more" button (not pagination)
- Filter reset always visible when filters are active
- Share button on every listing (Web Share API → fallback to copy link)
- "Back to results" breadcrumb on detail page (preserves filters)
- All touch targets minimum 44×44px
- Avoid horizontal scrolling except for photo galleries and filter chips

## Loading & Error States

Every data-dependent component needs three states:
1. **Loading**: Skeleton screen (not spinners that block interaction)
2. **Success**: The actual content
3. **Empty/Error**: Helpful message + action (retry or clear filters)

```
Skeleton card pattern:
┌─────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░  │  ← Photo placeholder (shimmer)
│  ░░░░░░░░░░░  ░░░░░░░░  │  ← Title + price
│  ░░░░░░  ░░░░░░  ░░░░░  │  ← Tags
└─────────────────────────┘
```

## Conversion Principles

The goal of Havn is not a booking — it's a **contact** (student reaches landlord). Design for this:
- Contact info / "Contact Landlord" button must ALWAYS be above the fold on detail page
- Never hide contact behind a sign-up wall (friction kills conversions for students)
- Make saving/favoriting frictionless (no account required for basic saves)
- Share feature = word of mouth = growth (Filipino students share with batchmates)
