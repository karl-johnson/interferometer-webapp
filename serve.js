// Minimal static file server for local viewing. Usage: node serve.js [port]
"use strict";
var http = require("http"), fs = require("fs"), path = require("path");

var port = parseInt(process.argv[2], 10) || 8000;
var root = __dirname;
var types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split("?")[0]);
  if (url.endsWith("/")) url += "index.html";
  var file = path.join(root, path.normalize(url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}).listen(port, "127.0.0.1", function () {
  console.log("Serving at http://localhost:" + port + "/  (Ctrl+C to stop)");
});
