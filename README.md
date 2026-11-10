# Havn PH

Boarding houses, bedspaces and rooms in Davao City. Live at www.havnph.com (Vercel deploys `main`).

Plain HTML, CSS and JavaScript. No build step.

- `index.html`: the page shell
- `assets/js/data.js`: **all rooms, schools and settings** (edit this to add or change a room)
- `assets/js/app.js`: rooms list, search, filters, saved rooms, routing
- `assets/js/room.js`: the room page (photos, details, map, Contact Landlord)
- `assets/js/map.js`: the map (OpenStreetMap data via OpenFreeMap, no API key; shops, restaurants, hotels and other places are removed)
- `assets/js/i18n.js`: English, Tagalog and Cebuano text
- `assets/css/havn.css`: styles

## Add a real room

1. Put its photos in `assets/photos/` as `<name>-640.webp` and `<name>-1200.webp` (4:3, any number of photos).
2. In `assets/js/data.js`, copy a listing and change it. For the exact pin, right-click the spot in Google Maps and copy the two numbers into `lat` and `lng`.
3. Delete `sample: true` for real rooms. When no sample rooms are left, the "sample listings" notice disappears.
4. Add the room's URL (`https://www.havnph.com/room/<id>`) to `sitemap.xml`.

## Contact Landlord

The button opens Messenger (`m.me/<messenger>` from `HAVN_CONFIG` in `data.js`) with a ready message copied. Nothing is sent from the site itself.

## Run locally

Any static server that sends `/room/*` to `index.html`, for example `npx serve -s .`

## Sample photos

Sample listings use free stock photos (rawpixel and StockSnap, CC0; Unsplash License). Sources are listed in `assets/photos/_credits.json`.
