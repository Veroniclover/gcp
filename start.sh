#!/bin/bash

v2ray run -c /app/config.json &
node server.js
