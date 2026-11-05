// D37: a simple user-agent check so link previews and crawlers don't count as the client
// opening the invoice. Not a security control; a determined script can still look human.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|whatsapp|telegram|slack|discord|skype|linkedin|twitter|embedly|pinterest|vkshare|google-inspectiontool|lighthouse|headless|curl|wget|python|node-fetch|undici|axios|go-http|okhttp|java\//i;

export function isLikelyBot(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20) return true;
  return BOT.test(ua);
}
