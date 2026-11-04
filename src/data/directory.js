// A built-in directory of well-known companies and services, so common names
// match instantly without a web search. Format: name|domain|category|aliases
// Add a line to add a company.
const RAW = `
Amazon|amazon.com|Shopping|amzn
Walmart|walmart.com|Shopping
Target|target.com|Shopping
Costco|costco.com|Shopping
Best Buy|bestbuy.com|Shopping
eBay|ebay.com|Shopping
Etsy|etsy.com|Shopping
The Home Depot|homedepot.com|Shopping|home depot
Lowe's|lowes.com|Shopping|lowes
Wayfair|wayfair.com|Shopping
Macy's|macys.com|Shopping|macys
Nordstrom|nordstrom.com|Shopping
Kohl's|kohls.com|Shopping|kohls
Apple|apple.com|Shopping|apple store
Nike|nike.com|Shopping
Adidas|adidas.com|Shopping
Sephora|sephora.com|Shopping
Ulta Beauty|ulta.com|Shopping|ulta
Chewy|chewy.com|Shopping
Newegg|newegg.com|Shopping
Lazada|lazada.com|Shopping
Shopee|shopee.com|Shopping
Tokopedia|tokopedia.com|Shopping
Bukalapak|bukalapak.com|Shopping
Zalora|zalora.com|Shopping
Qoo10|qoo10.com|Shopping
Alibaba|alibaba.com|Shopping
AliExpress|aliexpress.com|Shopping
Taobao|taobao.com|Shopping
JD.com|jd.com|Shopping|jingdong
Temu|temu.com|Shopping
Shein|shein.com|Shopping
Rakuten|rakuten.com|Shopping
Coupang|coupang.com|Shopping
Flipkart|flipkart.com|Shopping
Myntra|myntra.com|Shopping
Mercado Libre|mercadolibre.com|Shopping|mercadolivre
Jumia|jumia.com|Shopping
Takealot|takealot.com|Shopping
Noon|noon.com|Shopping
Zalando|zalando.com|Shopping
ASOS|asos.com|Shopping
Uniqlo|uniqlo.com|Shopping
Zara|zara.com|Shopping
H&M|hm.com|Shopping|h and m
IKEA|ikea.com|Shopping
Decathlon|decathlon.com|Shopping
Trader Joe's|traderjoes.com|Food & dining|trader joes
Whole Foods Market|wholefoodsmarket.com|Food & dining|whole foods
Kroger|kroger.com|Food & dining
Safeway|safeway.com|Food & dining
Aldi|aldi.us|Food & dining
Publix|publix.com|Food & dining
Instacart|instacart.com|Food & dining
Tesco|tesco.com|Food & dining
Carrefour|carrefour.com|Food & dining
Lidl|lidl.com|Food & dining
Sainsbury's|sainsburys.co.uk|Food & dining|sainsburys
Naivas|naivas.online|Food & dining
DoorDash|doordash.com|Food & dining
Uber Eats|ubereats.com|Food & dining
Grubhub|grubhub.com|Food & dining
Deliveroo|deliveroo.com|Food & dining
Just Eat|just-eat.com|Food & dining
foodpanda|foodpanda.com|Food & dining
GrabFood|grab.com|Food & dining|grab food
Swiggy|swiggy.com|Food & dining
Zomato|zomato.com|Food & dining
Glovo|glovoapp.com|Food & dining
Talabat|talabat.com|Food & dining
Rappi|rappi.com|Food & dining
iFood|ifood.com.br|Food & dining
Meituan|meituan.com|Food & dining
McDonald's|mcdonalds.com|Food & dining|mcdonalds|mcd
Starbucks|starbucks.com|Food & dining
KFC|kfc.com|Food & dining|kentucky fried chicken
Burger King|bk.com|Food & dining
Subway|subway.com|Food & dining
Domino's|dominos.com|Food & dining|dominos
Pizza Hut|pizzahut.com|Food & dining
Papa John's|papajohns.com|Food & dining|papa johns
Chipotle|chipotle.com|Food & dining
Taco Bell|tacobell.com|Food & dining
Wendy's|wendys.com|Food & dining|wendys
Chick-fil-A|chick-fil-a.com|Food & dining|chick fil a
Dunkin'|dunkindonuts.com|Food & dining|dunkin donuts|dunkin
Panera Bread|panerabread.com|Food & dining|panera
Five Guys|fiveguys.com|Food & dining
Shake Shack|shakeshack.com|Food & dining
In-N-Out Burger|in-n-out.com|Food & dining|in n out
Popeyes|popeyes.com|Food & dining
Wingstop|wingstop.com|Food & dining
Olive Garden|olivegarden.com|Food & dining
The Cheesecake Factory|thecheesecakefactory.com|Food & dining|cheesecake factory
Texas Roadhouse|texasroadhouse.com|Food & dining
Denny's|dennys.com|Food & dining|dennys
IHOP|ihop.com|Food & dining
Krispy Kreme|krispykreme.com|Food & dining
Baskin-Robbins|baskinrobbins.com|Food & dining|baskin robbins
Tim Hortons|timhortons.com|Food & dining
Nando's|nandos.com|Food & dining|nandos
Jollibee|jollibee.com.ph|Food & dining
Pret A Manger|pret.com|Food & dining|pret
Costa Coffee|costa.co.uk|Food & dining|costa
Java House|javahouseafrica.com|Food & dining
Din Tai Fung|dintaifung.com.tw|Food & dining
Yoshinoya|yoshinoya.com|Food & dining
Haidilao|haidilao.com|Food & dining
Uber|uber.com|Transport
Lyft|lyft.com|Transport
Bolt|bolt.eu|Transport
Grab|grab.com|Transport
Gojek|gojek.com|Transport
DiDi|didiglobal.com|Transport
Ola|olacabs.com|Transport
Careem|careem.com|Transport
Airbnb|airbnb.com|Transport
Booking.com|booking.com|Transport|booking
Expedia|expedia.com|Transport
Delta Air Lines|delta.com|Transport|delta
United Airlines|united.com|Transport|united
American Airlines|aa.com|Transport
Southwest Airlines|southwest.com|Transport|southwest
Emirates|emirates.com|Transport
Singapore Airlines|singaporeair.com|Transport
AirAsia|airasia.com|Transport
Kenya Airways|kenya-airways.com|Transport
Shell|shell.com|Transport
Chevron|chevron.com|Transport
ExxonMobil|exxonmobil.com|Transport|exxon|mobil
BP|bp.com|Transport
Netflix|netflix.com|Entertainment
Prime Video|primevideo.com|Entertainment|amazon prime|prime
Disney+|disneyplus.com|Entertainment|disney plus|disney
Hulu|hulu.com|Entertainment
Max|max.com|Entertainment|hbo max|hbo
Apple TV+|tv.apple.com|Entertainment|apple tv
Paramount+|paramountplus.com|Entertainment|paramount plus
Peacock|peacocktv.com|Entertainment
YouTube Premium|youtube.com|Entertainment|youtube
Spotify|spotify.com|Entertainment
Apple Music|music.apple.com|Entertainment
Tidal|tidal.com|Entertainment
Deezer|deezer.com|Entertainment
SoundCloud|soundcloud.com|Entertainment
Audible|audible.com|Entertainment
Twitch|twitch.tv|Entertainment
Crunchyroll|crunchyroll.com|Entertainment
Steam|store.steampowered.com|Entertainment
PlayStation|playstation.com|Entertainment|psn|ps plus
Xbox|xbox.com|Entertainment|game pass
Nintendo|nintendo.com|Entertainment
Epic Games|epicgames.com|Entertainment
Viu|viu.com|Entertainment
iQIYI|iq.com|Entertainment
Showmax|showmax.com|Entertainment
DAZN|dazn.com|Entertainment
ESPN+|plus.espn.com|Entertainment|espn
Scribd|scribd.com|Entertainment
Medium|medium.com|Entertainment
Patreon|patreon.com|Entertainment
Substack|substack.com|Entertainment
AMC Theatres|amctheatres.com|Entertainment|amc
Ticketmaster|ticketmaster.com|Entertainment
Facebook|facebook.com|Entertainment|meta
Instagram|instagram.com|Entertainment
X|x.com|Entertainment|twitter
LinkedIn Premium|linkedin.com|Software|linkedin
Snapchat|snapchat.com|Entertainment|snapchat plus
Discord Nitro|discord.com|Entertainment|discord
Reddit|reddit.com|Entertainment
Tinder|tinder.com|Entertainment
Bumble|bumble.com|Entertainment
GitHub|github.com|Software|github copilot|copilot
GitLab|gitlab.com|Software
Bitbucket|bitbucket.org|Software
Vercel|vercel.com|Software
Netlify|netlify.com|Software
Cloudflare|cloudflare.com|Software
AWS|aws.amazon.com|Software|amazon web services
Google Cloud|cloud.google.com|Software|gcp
Microsoft Azure|azure.microsoft.com|Software|azure
DigitalOcean|digitalocean.com|Software
Heroku|heroku.com|Software
Render|render.com|Software
Fly.io|fly.io|Software
Supabase|supabase.com|Software
Firebase|firebase.google.com|Software
MongoDB Atlas|mongodb.com|Software|mongodb
JetBrains|jetbrains.com|Software|intellij|webstorm
Figma|figma.com|Software
Notion|notion.so|Software
Linear|linear.app|Software
Slack|slack.com|Software
Zoom|zoom.us|Software
Microsoft 365|microsoft.com|Software|office 365|microsoft
Google One|one.google.com|Software
Google Workspace|workspace.google.com|Software|g suite
Dropbox|dropbox.com|Software
iCloud+|icloud.com|Software|icloud
Adobe Creative Cloud|adobe.com|Software|adobe|photoshop
Canva|canva.com|Software
ChatGPT|chatgpt.com|Software|openai
Claude|claude.ai|Software|anthropic|claude code
Cursor|cursor.com|Software
Replit|replit.com|Software
Lovable|lovable.dev|Software
Docker|docker.com|Software
Postman|postman.com|Software
Atlassian|atlassian.com|Software|jira|confluence
1Password|1password.com|Software
Bitwarden|bitwarden.com|Software
NordVPN|nordvpn.com|Software
ExpressVPN|expressvpn.com|Software
Grammarly|grammarly.com|Software
Duolingo|duolingo.com|Software
Coursera|coursera.org|Software
Udemy|udemy.com|Software
LeetCode|leetcode.com|Software
Namecheap|namecheap.com|Software
GoDaddy|godaddy.com|Software
Squarespace|squarespace.com|Software
Wix|wix.com|Software
Shopify|shopify.com|Software
Webflow|webflow.com|Software
Framer|framer.com|Software
Stripe|stripe.com|Other
PayPal|paypal.com|Other
Wise|wise.com|Other
Revolut|revolut.com|Other
Verizon|verizon.com|Housing
AT&T|att.com|Housing|att
T-Mobile|t-mobile.com|Housing|tmobile
Xfinity|xfinity.com|Housing|comcast
Spectrum|spectrum.com|Housing
Safaricom|safaricom.co.ke|Housing|mpesa|m-pesa
Airtel|airtel.com|Housing
MTN|mtn.com|Housing
Vodafone|vodafone.com|Housing
Singtel|singtel.com|Housing
Globe Telecom|globe.com.ph|Housing|globe
Con Edison|coned.com|Housing|coned
PG&E|pge.com|Housing|pge
Kenya Power|kplc.co.ke|Housing|kplc
CVS Pharmacy|cvs.com|Health|cvs
Walgreens|walgreens.com|Health
Boots|boots.com|Health
Planet Fitness|planetfitness.com|Health
Equinox|equinox.com|Health
Peloton|onepeloton.com|Health
ClassPass|classpass.com|Health
Headspace|headspace.com|Health
Calm|calm.com|Health
Strava|strava.com|Health
MyFitnessPal|myfitnesspal.com|Health
`;

export const DIRECTORY = RAW.trim().split('\n').map(line => {
  const [name, domain, category, ...aliases] = line.split('|');
  return { name, domain, category, keys: [name, ...aliases].map(k => k.toLowerCase().replace(/[^a-z0-9+&]/g, '')) };
});

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9+&]/g, '');

// Best matches for a typed name: exact, then starts-with, then contains.
export function searchDirectory(query, limit = 6) {
  const q = norm(query);
  if (q.length < 2) return [];
  const score = e => (e.keys.includes(q) ? 3 : e.keys.some(k => k.startsWith(q)) ? 2 : e.keys.some(k => k.includes(q) || (q.length >= 4 && q.includes(k) && k.length >= 4)) ? 1 : 0);
  return DIRECTORY.map(e => ({ e, s: score(e) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.e);
}

// A single confident match for a merchant name seen on a receipt or statement.
export function matchMerchant(text) {
  const t = norm(text);
  if (t.length < 2) return null;
  const exact = DIRECTORY.find(e => e.keys.includes(t));
  if (exact) return exact;
  const words = String(text).toLowerCase().split(/[^a-z0-9+&']+/).filter(w => w.length >= 3);
  return DIRECTORY.find(e => e.keys.some(k => k.length >= 4 && (t.startsWith(k) || words.includes(k)))) || null;
}
