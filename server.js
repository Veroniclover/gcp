const http = require("http");
const httpProxy = require("http-proxy");

const proxy = httpProxy.createProxyServer({
  target: "http://127.0.0.1:8001",
  ws: true,
  changeOrigin: true,
  xfwd: true
});

const XRAY_PATH = "/v1/projects/update";


const activeIPs = new Map();
let maxConnections = 0;


const TIMEOUT = 15000; 
const RATE_LIMIT_MS = 1000;


const lastSeen = new Map();

function getClientIP(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket.remoteAddress;
}

function getKey(req) {
  return getClientIP(req) + "|" + (req.headers["user-agent"] || "unknown");
}

function allow(ip) {
  const now = Date.now();
  const prev = lastSeen.get(ip) || 0;

  if (now - prev < RATE_LIMIT_MS) return false;

  lastSeen.set(ip, now);
  return true;
}

function cleanup() {
  const now = Date.now();
  for (const [key, ts] of activeIPs.entries()) {
    if (now - ts > TIMEOUT) {
      activeIPs.delete(key);
    }
  }
}


setInterval(cleanup, 5000);



const server = http.createServer((req, res) => {

  
  if (req.url === "/cmon") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Vray Dashboard</title>
  <style>
    body {
      font-family: Arial;
      text-align: center;
      background: #0f172a;
      color: white;
    }
    .box {
      margin-top: 80px;
      font-size: 48px;
    }
    .small {
      font-size: 20px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <h1>Vray Connections</h1>
  <div class="box" id="count">Loading...</div>
  <div class="small">Max: <span id="max">0</span></div>

  <script>
    async function load() {
      const res = await fetch('/stats');
      const data = await res.json();

      document.getElementById('count').innerText = data.connections;
      document.getElementById('max').innerText = data.max;
    }

    setInterval(load, 2000); 
    load();
  </script>
</body>
</html>
    `);
    return;
  }

  
  if (req.url === "/stats") {
    cleanup();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      connections: activeIPs.size,
      max: maxConnections
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});



server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith(XRAY_PATH)) {
    socket.destroy();
    return;
  }

  const ip = getClientIP(req);

  
  if (!allow(ip)) {
    socket.destroy();
    return;
  }

  const key = getKey(req);

  
  activeIPs.set(key, Date.now());

  if (activeIPs.size > maxConnections) {
    maxConnections = activeIPs.size;
  }

  
  proxy.ws(req, socket, head);

  
  socket.on("close", () => {
    activeIPs.delete(key);
  });

  socket.on("error", () => {
    activeIPs.delete(key);
  });
});



server.listen(8080, () => {
  console.log("Server running on port 8080");
});
