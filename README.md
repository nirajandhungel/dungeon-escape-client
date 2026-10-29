# Dungeon Escape: client
React + Vite + Phaser. Only talks to the server's /api/v1 (never to Banana or MongoDB directly).

    npm install
    npm run dev              # http://localhost:5173, proxies /api to http://localhost:4000

Start the server first. For production serve the built client from the same origin as the API (Nginx) so cookies stay same-site.
