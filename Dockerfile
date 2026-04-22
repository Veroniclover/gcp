FROM node:18-bullseye

RUN apt-get update && apt-get install -y curl unzip iproute2 && rm -rf /var/lib/apt/lists/*

RUN wget https://github.com/v2fly/v2ray-core/releases/latest/download/v2ray-linux-64.zip && unzip v2ray-linux-64.zip && rm v2ray-linux-64.zip && rm config.json

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
