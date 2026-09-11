/**
 * Ping IndexNow with every URL in the live sitemap.
 *
 *   pnpm --filter @workspace/scripts indexnow
 *
 * IndexNow is a push protocol: instead of waiting to be crawled, we tell the
 * participating engines a URL changed. One POST reaches Bing, Yandex, Seznam
 * and Naver. Google does NOT participate — Google is covered separately via
 * Search Console, which needs a human to prove domain ownership.
 *
 * Ownership here is proven by a key file served from the site root. That file
 * lives at artifacts/mavuno-hr-website/public/${KEY}.txt and its contents are
 * the key itself; the engines fetch it to confirm whoever submitted controls
 * the domain. Rotating the key means renaming that file and changing KEY here,
 * and the file has to be live before a submission will validate.
 *
 * Reading the URL list from the deployed sitemap rather than hardcoding it
 * means this keeps working as the site grows real routes.
 */

const KEY = "3b4410281770ccb76d2e82d26c7bf1dd";
const HOST = "mavunohr.co.ke";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

async function sitemapUrls(): Promise<string[]> {
  const res = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);

  const body = await res.text();
  // A 200 that is actually the SPA shell means the sitemap is missing and the
  // catch-all answered instead — the exact failure this whole change fixed.
  if (!body.trimStart().startsWith("<?xml")) {
    throw new Error("sitemap.xml did not return XML — is the site deployed?");
  }

  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const keyUrl = `${ORIGIN}/${KEY}.txt`;
  const keyRes = await fetch(keyUrl);
  if (!keyRes.ok || (await keyRes.text()).trim() !== KEY) {
    throw new Error(`key file not serving correctly at ${keyUrl} — deploy first`);
  }

  const urlList = await sitemapUrls();
  console.log(`submitting ${urlList.length} url(s):`, urlList);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: keyUrl, urlList }),
  });

  // 200 accepted, 202 accepted but the key is still being validated. Anything
  // else is worth reading: 422 usually means the key or host did not match.
  console.log(`${res.status} ${res.statusText}`, (await res.text()).trim());
  if (res.status !== 200 && res.status !== 202) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
