# Node-RED cloud dengan pustaka PostgreSQL dan MinIO untuk node function.
FROM nodered/node-red:5.0.10
RUN npm install --no-fund --no-update-notifier pg@8.23.1 minio@8.0.7
# settings.js ada di /data (userDir) dan perlu menemukan pustaka di atas
ENV NODE_PATH=/usr/src/node-red/node_modules
