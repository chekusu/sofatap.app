// Minimal loopback-only static server for previewing dist/.
// Usage: node scripts/serve.mjs [--dir dist] [--port 4173] [--base /some/prefix/]
// Directories redirect to a trailing slash (so zh -> zh/), like typical static hosts.
// --port 0 picks a free port; the actual URL is printed on start.
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const opts = { dir: path.join(ROOT, 'dist'), port: 4173, base: '/' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const [flag, value] = [argv[i], argv[i + 1]];
  if (flag === '--dir') opts.dir = path.resolve(value);
  else if (flag === '--port') {
    opts.port = Number(value);
    if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) { console.error(`无效端口：${value}`); process.exit(1); }
  }
  else if (flag === '--base') opts.base = `/${value.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
  else { console.error(`未知参数：${flag}`); process.exit(1); }
}

const isWithin = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.includes('\0')) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (opts.base !== '/' && pathname === opts.base.slice(0, -1)) {
    res.writeHead(301, { Location: opts.base }).end();
    return;
  }
  if (!pathname.startsWith(opts.base)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const rootDir = await realpath(opts.dir);
    let file = path.resolve(rootDir, `.${path.sep}${pathname.slice(opts.base.length)}`);
    if (!isWithin(file, rootDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(file)).isDirectory()) {
      // Relative links inside a directory page only resolve with a trailing slash.
      if (!pathname.endsWith('/')) {
        const { pathname: raw, search } = new URL(req.url, 'http://localhost');
        // Collapse leading slashes so the redirect can never become a //other-host URL.
        res.writeHead(301, { Location: `/${raw.replace(/^\/+/, '')}/${search}` }).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    // Symlinks must not lead outside the served directory.
    const real = await realpath(file);
    if (!isWithin(real, rootDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(real);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(real)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${opts.port} 已被占用，请换一个端口，或用 --port 0 自动选择。`
    : `预览服务器出错：${error.message}`);
  process.exit(1);
});

server.listen(opts.port, '127.0.0.1', () => {
  console.log(`预览：http://127.0.0.1:${server.address().port}${opts.base}`);
});
