/**
 * Parses an email address string to extract the base domain and subdomain.
 * @param {string} authorHeader - The author string from the message header.
 * @returns {{base: string, sub: string|null, full: string}|null}
 */
export function parseEmailDomain(authorHeader) {
  if (!authorHeader) return null;

  // 1. Extract email address
  // Matches <email@domain.com> or just email@domain.com
  let email = authorHeader;
  const match = authorHeader.match(/<([^>]+)>/);
  if (match) {
    email = match[1];
  }

  // trim whitespace
  email = email.trim();

  // 2. Strip trailing punctuation often found in malformed headers or display names
  // Prompt asked to strip: ) > ] , ;
  // We can do a regex replace at the end.
  // Although simpler is to split by @ first.

  const parts = email.split('@');
  if (parts.length < 2) return null;

  let domainObj = parts.pop(); // Take the last part as domain
  
  // Clean the domain string
  // Remove common trailing delimiters from the domain part if they exist
  domainObj = domainObj.replace(/[)>\]\,;]+$/, '');
  domainObj = domainObj.trim().toLowerCase();

  if (!domainObj) return null;

  // 3. Parse domain into base and sub
  // Base logic: last two labels.
  const labels = domainObj.split('.');
  
  if (labels.length < 2) {
    // e.g. "localhost" or something weird. Treat as base.
    return {
      base: domainObj,
      sub: null,
      full: domainObj
    };
  }

  // Base = last 2 labels
  const baseLabels = labels.slice(-2);
  const base = baseLabels.join('.');

  // Sub = everything before base
  const subLabels = labels.slice(0, -2);
  const sub = subLabels.length > 0 ? subLabels.join('.') : null;

  return {
    base,
    sub,
    full: domainObj
  };
}
