FROM node:18-bullseye

RUN apt-get update && apt-get install -y curl unzip iproute2 && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/v2fly/v2ray-core/releases/latest/download/v2ray-linux-64.zip -o v2ray.zip \
  && unzip v2ray.zip \
  && rm v2ray.zip config.json \
  && mv v2ray /usr/local/bin/v2ray \
  && chmod +x /usr/local/bin/v2ray

WORKDIR /app

COPY package.json /app
RUN npm install

COPY server.js /app
COPY config.json /app
COPY start.sh /app

RUN chmod +x start.sh

ENV PORT=8080

EXPOSE 8080

CMD ["./start.sh"]
