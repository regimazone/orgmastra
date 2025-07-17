import fs from 'fs';
import path from 'path';
import process from 'process';

const baseDir = path.join(process.cwd(), 'docs', 'src', 'content');

const findAllMdxFiles = dir => {
  let files = [];
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(findAllMdxFiles(fullPath));
    } else if (file.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }
  return files;
};

const extractLinkMatches = content => {
  const matches = [];
  const markdownRegex = /\[.*?\]\((.*?)\)/g;
  const htmlRegex = /<a\s+(?:[^>]*?\s+)?href="(.*?)"/g;

  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    matches.push({ url: match[1], raw: match[0] });
  }
  while ((match = htmlRegex.exec(content)) !== null) {
    matches.push({ url: match[1], raw: match[0] });
  }

  return matches;
};

const validateLink = async url => {
  if (url.startsWith('#') || url.startsWith('mailto:')) return true;

  if (url.endsWith('.mdx')) {
    const mdxPath = path.join(baseDir, url.replace(/^\//, ''));
    return fs.existsSync(mdxPath);
  }

  if (url.startsWith('/docs')) {
    const docPath = url.replace(/^\/docs/, '').replace(/\/$/, '');
    const fullPath = path.join(baseDir, docPath);
    return fs.existsSync(fullPath + '.mdx') || fs.existsSync(path.join(fullPath, 'index.mdx'));
  }

  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
};

const checkLinks = async () => {
  const start = Date.now();
  const mdxFiles = findAllMdxFiles(baseDir);
  const brokenLinks = [];

  for (const file of mdxFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = extractLinkMatches(content);
    const shortPath = file.replace(`${process.cwd()}`, '');

    let loggedHeader = false;

    for (const { url, raw } of matches) {
      const ok = await validateLink(url);

      if (!loggedHeader) {
        console.log(`\n${shortPath}`);
        loggedHeader = true;
      }

      console.log(`${ok ? '├──OK───────' : '├──BROKEN──'} ${url}`);
      console.log(`   → ${raw}`);

      if (!ok) brokenLinks.push({ file: shortPath, url, raw });
    }
  }

  const elapsed = Math.floor((Date.now() - start) / 1000);
  console.log('\n' + '='.repeat(40));
  console.log(`Files scanned: ${mdxFiles.length}`);
  console.log(`Broken links: ${brokenLinks.length}`);
  console.log(`Time elapsed: ${elapsed} seconds`);
  console.log('='.repeat(40));

  process.exit(brokenLinks.length > 0 ? 1 : 0);
};

checkLinks();
