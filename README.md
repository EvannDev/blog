# Carnet de bord du homelab

Blog technique d'Evann sur son homelab : Kubernetes sur Raspberry Pi, GitOps, réseau et agents IA.
Publié sur **https://blog.evann-deb.fr**.

- **Astro** (site statique), en français, thème clair et sombre, RSS, sitemap, tags et brouillons.
- **Image** : `ghcr.io/evanndev/blog`, multi-arch (amd64, arm64), servie par nginx non-root sur le port 8080.
- **Déploiement** : chaque merge sur `main` construit l'image `1.0.<n>`. Renovate met à jour le tag dans le dépôt
  `platform`, puis Argo CD déploie.

Pour écrire un article, lis [AGENTS.md](./AGENTS.md).

```bash
npm ci && npm run dev                    # développement local
docker build -t blog . && docker run --rm -p 8080:8080 blog   # tester l'image
```
