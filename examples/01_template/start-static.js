import http from 'node:http';
import serveHandler from 'serve-handler';

const base = '/custom-base/';

const server = http.createServer((req, res) => {
  if (req.url.startsWith(base)) {
    req.url = req.url.slice(base.length - 1);
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<a href="${base}">Return to base</a>`);
    return;
  }
  return serveHandler(req, res, {
    public: 'dist/public',
  });
});

server.listen(8080, () => {
  console.log(`ready: Listening on http://localhost:8080${base}`);
});
