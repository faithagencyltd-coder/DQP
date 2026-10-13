#!/bin/sh
pkill -f "planora-postgrest.conf" 2>/dev/null
pkill -f "local-stack/gateway.mjs" 2>/dev/null
true
