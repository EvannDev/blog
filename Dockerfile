# syntax=docker/dockerfile:1
# 1) Build du site sur l'architecture de la machine de build (résultat : HTML statique, indépendant de l'arch).
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 2) Binaire static-web-server (statique, une variante par architecture cible)
FROM joseluisq/static-web-server:2.44.1 AS sws

# 3) Image finale FROM scratch : le binaire, sa config et le site. Pas de shell, pas de libc, pas d'outils,
#    pas de gestionnaire de paquets : même avec une exécution de code dans le conteneur, rien à exploiter.
FROM scratch
COPY --from=sws /static-web-server /static-web-server
COPY sws.toml /sws.toml
COPY --from=build /app/dist /public
ENV SERVER_CONFIG_FILE=/sws.toml
# Utilisateur sans privilèges (65532 = « nonroot » de distroless ; aucun /etc/passwd n'est nécessaire)
USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/static-web-server"]
