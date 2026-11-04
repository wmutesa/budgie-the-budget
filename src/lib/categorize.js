// Category guesses from a merchant name and, when known, the web description.
import { matchMerchant } from '../data/directory';

export const CATEGORIES = ['Housing', 'Food & dining', 'Transport', 'Shopping', 'Entertainment', 'Software', 'Health', 'Income', 'Other'];

const RULES = [
  ['Food & dining', /trader joe|whole foods|walmart|kroger|aldi|costco|safeway|carrefour|tesco|lidl|grocer|supermarket|market|restaurant|cafe|coffee|starbucks|mcdonald|kfc|chipotle|pizza|burger|kitchen|grill|bakery|food|java house|naivas|quickmart/i],
  ['Transport', /uber|lyft|bolt|metro|transit|rail|train|bus|shell|chevron|exxon|total energies|\bbp\b|fuel|gas station|parking|airline|airways|flight|taxi/i],
  ['Shopping', /amazon|target|uniqlo|zara|h&m|nike|adidas|apple|best buy|ikea|jumia|ebay|etsy|shop|store|retail|clothing|electronics/i],
  ['Housing', /rent|landlord|mortgage|electric|water|utility|power|internet|comcast|verizon|safaricom home|kplc/i],
  ['Entertainment', /netflix|spotify|youtube|disney|hulu|prime video|cinema|movie|steam|playstation|xbox|nintendo|streaming|music|game/i],
  ['Health', /pharmacy|cvs|walgreens|clinic|hospital|dental|doctor|gym|fitness|health/i],
  ['Income', /payroll|salary|wage|deposit|refund|interest|dividend/i],
];

export function guessCategory(text = '', amount = 0) {
  if (amount > 0 && !/refund/i.test(text)) return 'Income';
  const known = matchMerchant(text);
  if (known) return known.category;
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'Other';
}
