#!/bin/bash -v

/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary --remote-debugging-port=9222 --enable-logging --v=1 --no-first-run --user-data-dir=./temp/chrome-dev-profile http://localhost:9222#http://localhost:8000/front_end/inspector.html


