import { createRequire } from 'module';
import { URL } from 'url';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

const CONCURRENCY_LIMIT = 5;
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const baseUrl = process.env.MASTRA_DEPLOYMENT_URL
  ? `${process.env.MASTRA_DEPLOYMENT_URL}/docs`
  : 'https://mastra.ai/docs';

const toVisit = [baseUrl];
const toSkip = ['http://localhost', 'https://localhost'];

const visited = new Set();
const checkedLinks = new Set();
const skipRepeatedElements = ['aside.nextra-sidebar', 'footer'];

let totalLinks = 0;
let okCount = 0;
let brokenCount = 0;
let pagesFetched = 0;
const checkedLinksStatuses = [];

const delay = ms => new Promise(res => setTimeout(res, ms));

const checkLink = async ({ url: linkUrl, text }) => {
  if (checkedLinks.has(linkUrl)) return true;
  checkedLinks.add(linkUrl);

  await delay(200);

  try {
    const res = await fetch(linkUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
      },
    });

    const status = res.status;
    checkedLinksStatuses.push(status);

    if (status === 404) {
      console.log(`${RED}├───BROKEN───${RESET} [${text}](${linkUrl}) [${status}]`);
      brokenCount++;
      return false;
    } else {
      console.log(`${GREEN}├───OK───${RESET} [${text}](${linkUrl}) [${status}]`);
      okCount++;
      return true;
    }
  } catch {
    return true;
  }
};

while (toVisit.length > 0) {
  const current = toVisit.shift();
  if (visited.has(current)) continue;

  try {
    const res = await fetch(current);
    const html = await res.text();
    pagesFetched++;

    const $ = cheerio.load(html);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('mailto:') || href.includes('#')) return;
      const absolute = new URL(href, current).toString();
      const normalized = absolute.split('#')[0];
      if (normalized.startsWith(baseUrl) && !visited.has(normalized)) {
        toVisit.push(normalized);
      }
    });

    const allLinks = $('a[href]');
    const linksToCheck = [];

    allLinks.each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (!href || href.startsWith('mailto:') || href.includes('#')) return;

      const absoluteUrl = new URL(href, current).toString();
      if (toSkip.some(prefix => absoluteUrl.startsWith(prefix))) return;

      const isInsideIgnoredRepeatedElement = skipRepeatedElements.some(selector => $(el).closest(selector).length > 0);
      if (isInsideIgnoredRepeatedElement && current !== baseUrl) return;

      linksToCheck.push({ url: absoluteUrl, text });
    });

    const newLinks = linksToCheck.filter(link => !checkedLinks.has(link.url));
    totalLinks += newLinks.length;
    visited.add(current);

    if (newLinks.length > 0) {
      console.log(`\n${current}`);
    }

    let pageHasBrokenLinks = false;
    for (let i = 0; i < newLinks.length; i += CONCURRENCY_LIMIT) {
      const chunk = newLinks.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(chunk.map(checkLink));
      if (results.includes(false)) {
        pageHasBrokenLinks = true;
      }
    }

    if (!pageHasBrokenLinks && newLinks.length > 0) {
      console.log(`${newLinks.length} LINKS FOUND`);
    }
  } catch (err) {
    console.error(`Failed to fetch ${current}:`, err.message);
  }
}

const statusCounts = {};
for (const code of checkedLinksStatuses) {
  statusCounts[code] = (statusCounts[code] || 0) + 1;
}

const totalFromStatus = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
const skippedOrUntracked = totalLinks - totalFromStatus;

console.log('\n' + '='.repeat(40));
console.log(`Pages fetched: ${pagesFetched}`);
console.log(`Total links checked: ${totalLinks}`);
console.log(`Ok: ${okCount}`);
console.log(`Broken: ${brokenCount}`);
if (skippedOrUntracked !== 0) {
  console.log(`Skipped/untracked: ${skippedOrUntracked}`);
}
console.log('Status codes:');
Object.entries(statusCounts)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .forEach(([code, count]) => {
    console.log(`- ${code}: ${count}`);
  });
console.log('='.repeat(40));

process.exit(brokenCount > 0 ? 1 : 0);
