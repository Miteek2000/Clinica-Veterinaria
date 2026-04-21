FROM nginx:alpine
COPY index.html /usr/share/nginx/html/
COPY config.js /usr/share/nginx/html/

# Script de inicialización que muestra el banner y luego inicia nginx
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'echo ""' >> /docker-entrypoint.sh && \
    echo 'echo "╔══════════════════════════════════════════╗"' >> /docker-entrypoint.sh && \
    echo 'echo "║  Frontend Clínica Veterinaria            ║"' >> /docker-entrypoint.sh && \
    echo 'echo "╠══════════════════════════════════════════╣"' >> /docker-entrypoint.sh && \
    echo 'echo "║  Frontend: http://localhost:3001         ║"' >> /docker-entrypoint.sh && \
    echo 'echo "║  API:      http://api:3000/api           ║"' >> /docker-entrypoint.sh && \
    echo 'echo "╚══════════════════════════════════════════╝"' >> /docker-entrypoint.sh && \
    echo 'echo ""' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]