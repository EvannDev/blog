# Carnet de bord du homelab

Blog technique d'Evann sur son homelab : Kubernetes sur Raspberry Pi, GitOps, réseau et agents IA.
Publié sur **https://blog.evann-deb.fr**.

- **Astro** (site statique), en français, thème clair et sombre, RSS, sitemap, tags et brouillons.
- **Image** : `ghcr.io/evanndev/blog`, multi-arch (amd64, arm64), **FROM scratch** : uniquement le binaire
  [static-web-server](https://static-web-server.net), sa config (`sws.toml`) et le site. Pas de shell ni d'outils,
  utilisateur non-root, port 8080, système de fichiers en lecture seule. Provenance SLSA et SBOM publiés avec l'image.
- **Déploiement** : chaque merge sur `main` construit l'image `1.0.<n>`. Renovate met à jour le tag dans le dépôt
  `platform`, puis Argo CD déploie.

Pour écrire un article, lis [AGENTS.md](./AGENTS.md).

```bash
npm ci && npm run dev                    # développement local
docker build -t blog . && docker run --rm --read-only --cap-drop ALL -p 8080:8080 blog   # tester l'image
```
