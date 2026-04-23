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
const POLL_INTERVAL = 10000;

function getClientIP(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket.remoteAddress;
}

function getKey(req) {
  return getClientIP(req) + "|" + (req.headers["user-agent"] || "unknown");
}

function cleanup() {
  const now = Date.now();
  for (const [key, ts] of activeIPs.entries()) {
    if (now - ts > TIMEOUT) activeIPs.delete(key);
  }
}

setInterval(cleanup, POLL_INTERVAL);

const server = http.createServer((req, res) => {

  if (req.url === "/cmon") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Vray Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      text-align: center;
      background: #0f172a;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    h1 { font-size: 22px; opacity: 0.6; margin-bottom: 32px; letter-spacing: 2px; text-transform: uppercase; }
    .box { font-size: 96px; font-weight: bold; line-height: 1; }
    .sub { margin-top: 12px; font-size: 16px; opacity: 0.5; }
    .meta { margin-top: 32px; font-size: 13px; opacity: 0.4; display: flex; gap: 24px; }
    .dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #22c55e;
      margin-right: 6px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    #refresh-bar {
      margin-top: 20px;
      width: 120px;
      height: 2px;
      background: #1e293b;
      border-radius: 2px;
      overflow: hidden;
    }
    #refresh-fill {
      height: 100%;
      background: #38bdf8;
      width: 100%;
      transition: width linear;
    }
  </style>
</head>
<body>
  <h1>Vray Connections</h1>

  <div class="box">
    <span class="dot"></span><span id="count">—</span>
  </div>
  <div class="sub">active connections</div>

  <div class="meta">
    <span>Peak: <strong id="max">0</strong></span>
    <span>Updated: <strong id="ago">just now</strong></span>
  </div>

  <div id="refresh-bar"><div id="refresh-fill"></div></div>

  <script>
    const INTERVAL = ${POLL_INTERVAL};
    let lastFetch = 0;

    async function fetchStats() {
      try {
        const res = await fetch('/stats');
        const data = await res.json();
        document.getElementById('count').textContent = data.connections;
        document.getElementById('max').textContent = data.max;
        lastFetch = Date.now();
        updateAgo();
        startBar();
      } catch (e) {
        document.getElementById('count').textContent = '?';
      }
    }

    function startBar() {
      const fill = document.getElementById('refresh-fill');
      fill.style.transition = 'none';
      fill.style.width = '100%';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.transition = \`width \${INTERVAL}ms linear\`;
          fill.style.width = '0%';
        });
      });
    }

    function updateAgo() {
      const sec = Math.round((Date.now() - lastFetch) / 1000);
      const el = document.getElementById('ago');
      el.textContent = sec <= 1 ? 'just now' : \`\${sec}s ago\`;
    }

    setInterval(fetchStats, INTERVAL);
    setInterval(updateAgo, 1000);

    fetchStats();
  </script>
</body>
</html>
    `);
    return;
  }

  if (req.url === "/stats") {
    cleanup();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connections: activeIPs.size, max: maxConnections }));
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

  const key = getKey(req);
  activeIPs.set(key, Date.now());

  if (activeIPs.size > maxConnections) maxConnections = activeIPs.size;

  proxy.ws(req, socket, head);

  socket.on("data", () => activeIPs.set(key, Date.now()));
});

server.listen(8080, () => console.log("Server running on port 8080"));
