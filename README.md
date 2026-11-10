# ECStay (repo: Havn PH)

ECStay (Explore, Come, Stay): boarding houses, bedspaces and rooms in Davao City. Live at www.havnph.com (Vercel deploys `main`).

Plain HTML, CSS and JavaScript. No build step.

- `index.html`: the page shell
- `assets/js/data.js`: **all rooms, schools, landmarks (malls, hospitals, offices) and settings** (edit this to add or change a room)
- `assets/js/app.js`: rooms list (`/rooms`), search, filters, saved rooms, routing
- `assets/js/home.js`: the home page (`/`): room-type tabs + big search with Kapi the capybara, popular places, rows of rooms, Kapi's note, the closing scene
- `assets/js/capy.js` + `assets/capy/`: Kapi, the moving 3D capybara (three.js, loaded only on the home page; `kapi.webp` is the still picture shown first and on slow connections). Three Kapis: next to the search (`data-capy="stand"`), leaning in beside his note (`peek`) and hopping in the closing scene (`jump`); they share one model file.
- `assets/scene/`: the closing scene, one picture (davao-golden-*.webp): Davao and Mt Apo at golden hour with Kapi's friends painted in (tarsier on the tree, carabao reading, kitten behind the bush, eagle chick on a branch), made with Higgsfield. Its bottom edge fades into the footer colour `--foot`; its top row is `--sky`. The 3D Kapi hops on the grass; the picture rises with a parallax as you scroll.
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

## Landlords (List your place)

`assets/js/landlord.js`: the "Do you own a boarding house?" pop-up (centered, page dimmed behind it; shows 15 seconds into a first visit, asks again after 14 days if closed or 90 days after "No, I'm looking for a room", never after someone sends the form) and the listing form. "List your place" links and **havnph.com/list** open the form directly; share that link with landlords.

Two settings in `HAVN_CONFIG` (`data.js`):

- `phone`: the number landlords can call or text, written the way it should be shown (`'0917 123 4567'`). Empty hides the Call / Text buttons.
- `landlordFormKey`: where the form answers go. At web3forms.com, type the email that should receive them; the key is emailed to it. Paste it here. Each form arrives as an email titled "New landlord: <name> (<place>)". Empty = the form opens Messenger with the details filled in instead.

## Run locally

Any static server that sends `/rooms`, `/list` and `/room/*` to `index.html`, for example `npx serve -s .`

## Sample photos

Sample listings use free stock photos (rawpixel and StockSnap, CC0; Unsplash License). Sources are listed in `assets/photos/_credits.json`.

## Our own look (no copying)

Map + list, filter chips, a heart to save and price markers are common patterns on many rental and property sites. Nothing here is taken from another company: no logos, brand colours, fonts, icons, photos, code or wording. Keep it that way:

- Colours: ECStay evergreen, brass and ivory (see below). Fonts: Newsreader + Hanken Grotesk (Google Fonts, OFL). Icons: Lucide line icons (ISC, credited in `index.html`).
- Map price pins are evergreen tags (brass when picked) whose tail points at the exact spot. The search bar is a rounded rectangle with a labelled "Search" button. Card photos are 3:2. The room page shows 3 photos and a "See all N photos" button.
- The home page has room-type tabs with line icons, a big search and our own mascot (Kapi the capybara, made with Higgsfield/Meshy, in an evergreen bandana as the ECStay concierge), then rows of rooms (places are picked from the search suggestions).
- Write our own words. Don't copy another site's phrases, and don't name other companies in the code or on the site.

## Brand and search

- Brand: **ECStay** = Explore, Come, Stay (Carl, 11 Nov 2026; before that Kapibahay for a day, and Havn PH). Line: "Explore. Come. Stay."
- Look (from research on premium stay brands): warm ivory pages, one deep colour, one metallic accent, a serif for headlines. Evergreen `#1D3F35` (Mt Apo forests: buttons, links, pins), brass `#B98B4E` / `#8A6431` for small text (golden hour: eyebrows, accents), ivory `#F9F6F0`, linen `#EFE8DC`, ink `#17221D`, footer `#1C2A21`. Tokens at the top of `havn.css`; older names (`--blue`, `--navy`, `--kapi`) point at the new colours.
- Type: Newsreader (headlines, wordmark, Kapi's note) + Hanken Grotesk (everything else). No spaced-out capital labels, no italic accent words. Buttons are pills; line icons at 1.6 stroke.
- Logo: `assets/brand/ecstay-mark.svg` (an arched doorway looking out at Mt Apo and the sun) + the wordmark "ECStay" set in Newsreader 600; `ecstay-mark-light.svg` for the dark footer. Icons: `apple-touch-icon.png`, `ecstay-512.png`.
- Keep the home H1 a keyword sentence ("Boarding houses, bedspaces and rooms for rent in Davao City"); the slogan sits above it, never in its place.
- `index.html` carries Organization and WebSite (search box) data, plus a plain-HTML copy of the home content for crawlers that do not run JavaScript (hidden once the app loads). The questions and answers live only in `llms.txt` (Carl took them off the home page on 11 Nov; FAQPage data must match visible content, so it was removed too).
- `llms.txt` describes the site for AI search tools. `assets/og.jpg` is the share picture.
- When real rooms replace the samples, update the last answer ("Are the rooms on ECStay real?") in `llms.txt`.
