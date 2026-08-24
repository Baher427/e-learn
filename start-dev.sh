#!/bin/bash
# Starts the Next.js dev server with a clean environment loaded from .env
# This avoids stale DATABASE_URL from the persistent shell overriding .env.
cd /home/z/my-project
exec env -i \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin:$(bun --installbin 2>/dev/null || echo $HOME/.bun/bin)" \
  HOME="$HOME" \
  USER="$USER" \
  TERM="$TERM" \
  bun x next dev -p 3000
