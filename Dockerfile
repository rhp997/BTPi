### Build
# docker build -f Dockerfile -t btpi:latest .
### Run (see IronHide docker-compose for real deployment)
# docker run -it -d --name btpi -p 3000:3000 btpi:latest
#
# Production: https://btpi.dodsonlumber.net
# Build context on IronHide: /share/Apps/docker/btpi
# Compose: /share/Apps/docker/website/docker-compose.yml

FROM node:24-bookworm-slim
LABEL maintainer="Steve Dodson <support@dodsonlumber.com>"
LABEL version="1.2.4"

RUN apt-get update && apt-get install -y --no-install-recommends \
    nano less procps tzdata libterm-readline-gnu-perl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=America/Denver
ENV BTPI__PORT=3000
# Optional admin UI (override in btpi.env). When unset/disabled, /admin returns 404.
# ENV ADMIN__ENABLED=true
# ENV ADMIN__USER=admin
# ENV ADMIN__PASSWORD=change-me

SHELL ["/bin/bash", "-c"]
RUN echo "alias ll='ls -al'" >> /root/.bashrc

### Container-attach notice: shown on every login shell (e.g. `docker exec
### ... bash -l`, our IronHide access pattern) and every non-login
### interactive shell, so no one mistakes this for the real Raspberry Pi.
COPY docker/notice.sh /etc/profile.d/notice.sh
RUN chmod +x /etc/profile.d/notice.sh \
    && printf '\nif [ -r /etc/profile.d/notice.sh ]; then . /etc/profile.d/notice.sh; fi\n' >> /etc/bash.bashrc

WORKDIR /srv/BTPi

COPY package*.json ./
RUN npm ci --omit=dev

### App code; production config.json / queries.json are bind-mounted at runtime
### from the host (see compose volumes) so admin saves and backups persist.
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
