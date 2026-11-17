/* Havn PH — site settings and listings.
 *
 * To add a real room: copy one listing below, give it a new id, set its exact
 * pin (lat/lng: right-click the spot in Google Maps and copy the two numbers),
 * put its photos in /assets/photos/ and list their names (without -640/-1200.webp).
 * Remove `sample: true` from real rooms. When no sample rooms are left, the
 * "sample listings" notice disappears by itself.
 */

window.HAVN_CONFIG = {
  siteUrl: 'https://www.ecstay.ph',
  // The ECStay Facebook page. messenger = its username or page ID, for m.me/<messenger> links.
  // (Never 'havnph': that name belongs to someone else's profile.)
  facebook: 'https://www.facebook.com/profile.php?id=61574262600669',
  messenger: '61574262600669',
  // Number landlords can call or text, as you want it shown (e.g. '0917 123 4567').
  // Empty = the Call / Text buttons are hidden.
  phone: '0995 510 4274',
  // Email Keepers and renters can write to (e.g. 'hello@yourdomain.com'). Empty = no email link is shown.
  email: '',
  // Where the "List your place" form goes. Get a free key at web3forms.com: type the
  // email that should receive the forms and the key is emailed to it. Paste it here.
  // Empty = the form hands the landlord's details to Messenger instead.
  landlordFormKey: '',
  // Landlord accounts, listings, renter messages and emails (see supabase/README.md). Both empty = accounts are
  // off and the site keeps the form above. Add ?demo=1 to any address to try the whole flow without them.
  supabaseUrl: 'https://bbrigtzwdtpjfjylwqpm.supabase.co',      // e.g. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'sb_publishable_XtkfFJAYAuCmmmGR35v3dw_RyhfgDO5',
  // Set to true once Google sign-in is switched on in Supabase (Authentication > Providers > Google).
  // Set to true once sign-in by text is switched on (see supabase/README.md, "Sign-in by text").
  smsSignIn: false,
  googleSignIn: true,  // the project's public "anon" key (safe to publish; row-level security protects the data)
};

window.HAVN_SCHOOLS = [
  { id: 'addu', short: 'AdDU', name: 'Ateneo de Davao University', lat: 7.07181, lng: 125.61342 },
  { id: 'um', short: 'UM', name: 'University of Mindanao (Main)', lat: 7.06702, lng: 125.60950 },
  { id: 'um-matina', short: 'UM Matina', name: 'University of Mindanao (Matina)', lat: 7.06715, lng: 125.59493 },
  { id: 'usep', short: 'USeP', name: 'University of Southeastern Philippines', lat: 7.08577, lng: 125.61608 },
  { id: 'spc', short: 'SPC', name: 'San Pedro College', lat: 7.07799, lng: 125.61562, labelSide: 'left' },
  { id: 'hcdc', short: 'HCDC', name: 'Holy Cross of Davao College', lat: 7.07752, lng: 125.61643 },
  { id: 'ddc', short: 'DDC', name: 'Davao Doctors College', lat: 7.07190, lng: 125.60340 },
  { id: 'upmin', short: 'UP Min', name: 'UP Mindanao', lat: 7.08491, lng: 125.48581 },
];

/* Places people go every day (malls, hospitals, offices): rooms can be searched "near" these
 * just like schools. Pins from OpenStreetMap. kind: mall | hospital | work. */
window.HAVN_LANDMARKS = [
  { id: 'gmall', short: 'Gmall', name: 'Gaisano Mall of Davao', kind: 'mall', lat: 7.07763, lng: 125.61415 },
  { id: 'sm-lanang', short: 'SM Lanang', name: 'SM Lanang Premier', kind: 'mall', lat: 7.09897, lng: 125.63077 },
  { id: 'abreeza', short: 'Abreeza', name: 'Abreeza Mall and Business Park', kind: 'mall', lat: 7.09150, lng: 125.61200 },
  { id: 'nccc-vp', short: 'NCCC Mall VP', name: 'NCCC Mall VP (Victoria Plaza)', kind: 'mall', lat: 7.08662, lng: 125.61176 },
  { id: 'felcris', short: 'Felcris Centrale', name: 'Felcris Centrale, Quimpo Blvd', kind: 'mall', lat: 7.05949, lng: 125.60890 },
  { id: 'sm-ecoland', short: 'SM Ecoland', name: 'SM City Davao (Ecoland)', kind: 'mall', lat: 7.04875, lng: 125.58881 },
  { id: 'citygate', short: 'Gaisano Citygate', name: 'Gaisano Grand Citygate, Buhangin', kind: 'mall', lat: 7.11091, lng: 125.61265 },
  { id: 'spmc', short: 'SPMC', name: 'Southern Philippines Medical Center', kind: 'hospital', lat: 7.09978, lng: 125.61948 },
  { id: 'ddh', short: 'Davao Doctors', name: 'Davao Doctors Hospital', kind: 'hospital', lat: 7.07044, lng: 125.60441 },
  { id: 'cybergate', short: 'Robinsons Cybergate', name: 'Robinsons Cybergate Davao (offices)', kind: 'work', lat: 7.09957, lng: 125.62394 },
  { id: 'damosa', short: 'Damosa IT Park', name: 'Damosa IT Park, Lanang', kind: 'work', lat: 7.10411, lng: 125.63461 },
  { id: 'city-hall', short: 'City Hall', name: 'Davao City Hall', kind: 'work', lat: 7.06445, lng: 125.60772 },
];

window.HAVN_AREAS = ['Poblacion', 'Bajada', 'Obrero', 'Matina', 'Ma-a', 'Mintal', 'Buhangin'];

window.HAVN_ROOM_TYPES = ['Bedspace', 'Shared room', 'Private room', 'Studio'];

/* Amenity keys → label + icon (labels are translated in i18n.js). */
window.HAVN_AMENITIES = {
  wifi: { label: 'Wi-Fi', icon: 'wifi' },
  aircon: { label: 'Aircon', icon: 'snowflake' },
  fan: { label: 'Electric fan', icon: 'wind' },
  'own-cr': { label: 'Own CR', icon: 'bath' },
  'shared-cr': { label: 'Shared CR', icon: 'bath' },
  shower: { label: 'Hot shower', icon: 'shower' },
  kitchen: { label: 'Kitchen access', icon: 'utensils' },
  laundry: { label: 'Laundry area', icon: 'shirt' },
  desk: { label: 'Study desk', icon: 'book' },
  lockers: { label: 'Personal locker', icon: 'lock' },
  fridge: { label: 'Refrigerator', icon: 'fridge' },
  water: { label: 'Water dispenser', icon: 'droplet' },
  cctv: { label: 'CCTV', icon: 'cctv' },
  guard: { label: '24/7 security', icon: 'shield' },
  parking: { label: 'Parking', icon: 'car' },
  meals: { label: 'Meal plan available', icon: 'soup' },
};

/* Every listing below is a SAMPLE (stock photos, pins on real streets) so the
 * site can be reviewed before real rooms are added. Three are kept for the dry run (17 Nov 2026);
 * the other nine are in git history (commit before this one). */
window.HAVN_LISTINGS = [
  {
    id: 'maharlika-residences',
    sample: true,
    name: 'Maharlika Residences',
    type: 'Private room',
    gender: 'female',
    area: 'Poblacion',
    street: 'E. Jacinto St.',
    lat: 7.07470, lng: 125.61160,
    price: 8500,
    status: 'available', slots: 2,
    size: 14, bath: 'own',
    bills: 'Water included · electricity sub-metered',
    amenities: ['wifi', 'aircon', 'own-cr', 'shower', 'desk', 'laundry', 'guard', 'cctv'],
    rules: { curfew: '11:00 PM', visitors: 'Lobby only, until 8 PM', cooking: 'Rice cooker allowed in the room' },
    desc: 'A quiet ladies-only house a short walk from Ateneo de Davao. Three floors, a rooftop study lounge, fiber Wi-Fi, and a house manager who lives on site.',
    host: { name: 'Tita Marisol', since: 2020 },
    photos: ['r-e01d08dd', 's-56af3e05', 'r-73d53165', 'u-5fefe8c9'],
  },
  {
    id: 'matina-stayhouse',
    sample: true,
    name: 'Matina Stayhouse',
    type: 'Bedspace',
    gender: 'mixed',
    area: 'Matina',
    street: 'Cannes St.',
    lat: 7.06590, lng: 125.59380,
    price: 3800,
    status: 'few', slots: 1,
    size: 6, bath: 'shared',
    bills: 'Water and electricity included',
    amenities: ['wifi', 'aircon', 'shared-cr', 'kitchen', 'lockers', 'water', 'laundry', 'cctv'],
    rules: { curfew: '10:00 PM', visitors: 'Not allowed upstairs', cooking: 'Shared kitchen on each floor' },
    desc: 'Four beds per room with personal lockers and a study nook, a few minutes from UM Matina. Separate floors for men and women.',
    host: { name: 'Ate Lyn', since: 2022 },
    photos: ['r-46550766', 'r-5bdb6cad', 'r-62de96e3', 'u-9f1947ee'],
  },
  {
    id: 'casa-bajada',
    sample: true,
    name: 'Casa Bajada',
    type: 'Studio',
    gender: 'mixed',
    area: 'Bajada',
    street: 'J.P. Laurel Ave.',
    lat: 7.08990, lng: 125.61050,
    price: 12000,
    status: 'available', slots: 1,
    size: 22, bath: 'own',
    bills: 'Electricity and water sub-metered',
    amenities: ['wifi', 'aircon', 'own-cr', 'shower', 'kitchen', 'fridge', 'parking', 'cctv'],
    rules: { curfew: null, visitors: 'Allowed until 10 PM', cooking: 'Own kitchenette' },
    desc: 'Studio units in a converted family home. Each unit has its own kitchenette and a small balcony over an inner garden. Suits young professionals.',
    host: { name: 'Engr. Paulo', since: 2023 },
    photos: ['r-a7ecbd80', 'r-69add83d', 's-6f60f253', 's-da357e55'],
  },
];
