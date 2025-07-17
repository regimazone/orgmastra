import fs from 'fs';
import path from 'path';
import process from 'process';

const contentDir = path.join(process.cwd(), 'docs', 'src', 'content', 'en', 'docs');

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

  const markdownRegex = /\[([^\]]+)]\((\/[^)]+)\)/g;
  const htmlRegex = /<a\s+[^>]*href="(\/[^"]+)"[^>]*>(.*?)<\/a>/g;

  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    matches.push({ text: match[1], url: match[2] });
  }
  while ((match = htmlRegex.exec(content)) !== null) {
    matches.push({ text: match[2], url: match[1] });
  }

  return matches;
};

const logNonMdxLinks = () => {
  const mdxFiles = findAllMdxFiles(contentDir);
  let totalNonMdxLinks = 0;

  for (const file of mdxFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const links = extractLinkMatches(content).filter(
      ({ url }) =>
        !url.endsWith('.mdx') && !url.startsWith('http') && !url.startsWith('#') && !url.startsWith('mailto:'),
    );

    if (links.length > 0) {
      console.log(`\nFile: ${file.replace(process.cwd(), '')}`);
      for (const { text, url } of links) {
        console.log(`├── [${text}](${url})`);
        totalNonMdxLinks++;
      }
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Files scanned: ${mdxFiles.length}`);
  console.log(`Links without .mdx: ${totalNonMdxLinks}`);
  console.log('='.repeat(40));
};

logNonMdxLinks();
