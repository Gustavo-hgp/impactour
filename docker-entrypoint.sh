#!/bin/sh
set -e

# Executado pelo entrypoint oficial do nginx (scripts em /docker-entrypoint.d/)
# antes do nginx subir. Gera o config.js em runtime a partir das variáveis de
# ambiente, para que a mesma imagem sirva qualquer projeto Supabase sem rebuild.
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
};
EOF
