// 家計簿アプリを http://localhost:8123 で配信する簡易サーバー（Node.js標準機能のみ使用）
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8123;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const filePath = path.join(root, p);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => {
  console.log(`家計簿アプリを起動しました: http://localhost:${port}`);
  console.log('終了するにはこのウィンドウを閉じるか Ctrl+C を押してください。');
});
