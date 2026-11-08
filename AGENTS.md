# Guide pour les agents (et les humains) qui écrivent sur ce blog

Ce dépôt est le blog **Carnet de bord du homelab** (Astro, site statique), publié sur https://blog.evann-deb.fr.
**Fusionner sur `main` = publier** : une image est construite, puis déployée sur le cluster par Argo CD.

## Écrire un article

1. Crée une branche **`<ton-nom>/<slug>`**, par exemple `pippin/kubernetes-sur-raspberry-pi`. La gateway refuse toute
   écriture ailleurs.
2. Ajoute **un fichier** `src/content/blog/<slug>.md` (ou `.mdx`). Le slug, en minuscules avec des tirets et sans
   accents, devient l'URL `/blog/<slug>/`.
3. Frontmatter, validé au build (un champ invalide fait échouer la CI) :
   ```yaml
   ---
   title: 'Titre (90 caractères max)'
   description: 'Une ou deux phrases (200 caractères max), utilisées pour le SEO et les réseaux.'
   pubDate: 2026-11-07
   tags: ['kubernetes', 'raspberry pi']     # 2 à 5 tags, en minuscules, réutilise les existants
   draft: true                              # true tant que la relecture n'est pas finie
   writtenBy: 'Pippin'
   reviewedBy: ['Galadriel', 'Legolas']      # renseigné au fil des relectures
   ---
   ```
4. Ouvre une **pull request** vers `main`, avec dans la description :
   - les sources utilisées : fichiers du dépôt `platform`, issues, rapports ;
   - les points à vérifier.
5. C'est **Evann qui passe `draft: false` et qui fusionne**. Jamais un agent.

## Style

**Le texte doit sonner comme Evann, pas comme une IA.** Avant de livrer, relis-toi avec le skill
[`humanizer-fr`](./.agents/skills/humanizer-fr/SKILL.md) (adaptation française de Humanizer). Les textes d'Evann dans
[`docs/voix/`](./docs/voix/) priment sur toutes les règles ci-dessous.


- **Français**, ton direct et concret, à la première personne (« je ») : c'est le carnet d'Evann.
- Les termes techniques restent en anglais quand c'est l'usage (pod, rollout, GitOps…).
- Des titres `##` qui disent ce que contient la section (pas de titre « pour l'effet »), et des paragraphes courts.
- **Montre du vrai** : des extraits de manifests ou de config **réels et simplifiés**, toujours dans des blocs de code
  avec leur langage (` ```yaml `, ` ```bash `…).
- Explique le **pourquoi** et les **compromis**, pas seulement le comment. Les échecs et les incidents sont les
  meilleurs sujets.
- 800 à 1 800 mots. Pas d'introduction qui annonce le plan, pas de conclusion qui résume : on finit sur le dernier
  fait concret.
- Guillemets français « … » dans la prose. Pas de tiret cadratin pour les incises. Gras au plus une fois par section.

## Ce qu'on ne publie JAMAIS (relecture sécurité obligatoire)

- Adresses IP internes, plages réseau, noms de nœuds associés à une IP.
- Secrets, tokens, clés, **hash** de clés d'agent, noms d'éléments Bitwarden, identifiants d'App ou d'installation
  GitHub.
- URLs de webhooks, de routines Paperclip, de services privés (`*.homelab.…`).
- Une faille connue **non corrigée**, ou une description exploitable d'un point faible actuel.
- Un doute ? Généralise (« une IP du LAN », « un token stocké dans Bitwarden ») ou retire le passage.

## Interface : le design system « Carnet de bord »

L'UI suit le design system publié sur Claude Design : https://claude.ai/artifact/S3TcWs1UKBLWH5PTWm59pG (lis son
`README.md`, puis la fiche du composant concerné). Dans le code :

- les jetons (couleurs clair / sombre, ombres, rayons, espacements) et les classes `cb-*` sont dans
  [`src/styles/global.css`](./src/styles/global.css), avec les mêmes noms que `tokens.json` ;
- les polices (Bodoni Moda, Fredoka, Quicksand, JetBrains Mono, et Gloock, Unbounded, Instrument Serif pour le collage) sont auto-hébergées par l'API Fonts d'Astro
  (`astro.config.mjs`) : ne charge jamais une police ou un style depuis un CDN, la CSP de `sws.toml` le bloque ;
- composants : `Header`, `Footer`, `PostCard`, `FeatureCard`, `TagList`, `Ornament` (stickers infra), `CollageTitle` (titre de l'accueil) dans `src/components/`.

Une valeur en dur (couleur, ombre floue, rayon) au lieu d'un jeton est un bug.

## Développement

```bash
npm ci
npm run dev        # http://localhost:4321 (les brouillons sont visibles)
npm run build      # site de production dans dist/ (sans les brouillons)
```

Documentation Astro : https://docs.astro.build (content collections :
https://docs.astro.build/en/guides/content-collections/).
