---
title: "Argo CD pilote mon homelab depuis Git"
description: "Une Application racine déploie des Applications filles, rangées en briques communes et en usages : comment Argo CD tient mon homelab depuis un seul dépôt Git, et ce que ça coûte."
pubDate: 2026-11-08
tags: ['gitops', 'argo cd', 'kubernetes', 'homelab']
draft: true
writtenBy: 'Pippin'
reviewedBy: []
---

## Un seul dépôt pour changer le cluster

Pour changer quelque chose sur le cluster, je ne lance ni `helm upgrade` ni `kubectl edit` : je fais un commit sur `main` de mon dépôt platform. Ce dépôt est privé et décrit tout ce qui tourne. Argo CD compare en continu son contenu avec le cluster et corrige l'écart. Si je modifie une release à la main, la synchronisation automatique la remet dans l'état du dépôt, grâce à `selfHeal`. Le README du dépôt le rappelle : jamais de `helm upgrade` à la main.

Les mises à jour passent par le même chemin, et fusionner une PR sur `main` revient à déployer. Pour le blog, la chaîne tient en quatre étapes : une fusion sur le dépôt du blog construit une image, Renovate ouvre une PR sur platform pour changer l'image, la PR est fusionnée, Argo CD déploie. Je reviens sur Renovate plus bas.

Le dépôt a pris sa forme actuelle en deux jours. Le premier commit date du 4 novembre 2026 : il contenait déjà les patches Talos, Cilium avec l'annonce L2, Argo CD et Gateway API avec agentgateway. Le 6 novembre, je l'ai restructuré en monorepo Argo CD, avec une Application racine récursive à la place d'un dossier d'amorçage. Les Applications ont gardé leur nom pour qu'Argo CD ne les recrée pas.

## Amorcer : Argo CD, puis l'Application racine

Argo CD ne peut pas se déployer lui-même à partir de rien. Sur des nœuds Talos neufs, rien ne démarre sans CNI (c'est dans [l'article sur Talos](/blog/talos-trois-raspberry-pi-une-image-par-role/)). J'installe donc Cilium, puis Argo CD, avec Helm, une seule fois et à la main, en reprenant les values déjà présentes dans le dépôt.

Il reste un problème d'œuf et de poule : Argo CD doit lire un dépôt privé, et External Secrets n'est pas encore là pour lui fournir l'accès. Les secrets d'amorçage sont donc créés à la main avant le reste. Quand External Secrets tourne, il reprend celui qui donne accès au dépôt (une clé de déploiement) depuis le gestionnaire de secrets externe.

Dernière étape manuelle : appliquer l'Application racine.

```yaml
# argocd/root-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: <dépôt privé platform>
    targetRevision: main
    path: apps
    directory:
      recurse: true   # apps/shared/ + apps/workloads/
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Elle lit `apps/` en récursif. Un fichier d'Application ajouté dans ce dossier est déployé sans autre geste, et `prune` supprime ce qui disparaît du dépôt. Le commentaire en tête du fichier précise qu'on ne l'applique qu'une fois.

Argo CD et Cilium sont ensuite repris par deux Applications, `argocd` et `cilium`, qui adoptent les releases Helm déjà installées. Le 4 novembre, la reprise a pris deux commits à moins de deux minutes d'écart : une synchronisation manuelle d'abord, puis la synchronisation automatique. Contrairement à la racine, ces deux Applications n'ont pas de finalizer, et leur commentaire dit que supprimer l'Application ne supprime pas le composant. La procédure de reconstruction du dépôt prévoit aussi de supprimer l'historique Helm de ces deux releases, pour qu'Argo CD soit seul à les gérer.

Les Applications dont je parle ici utilisent toutes le projet `default`. Un AppProject limite les dépôts sources, les destinations et les types de ressources qu'une Application peut toucher. Les miens vivent dans `argocd/projects/`, et l'Application `argocd` les applique.

## Deux couches : briques communes et usages

Sous `apps/`, deux dossiers, `shared/` et `workloads/`. Chaque Application porte un label `homelab/layer` qui dit dans quelle couche elle est.

`apps/shared/` contient les briques communes :

- le réseau : Cilium comme CNI, plus un pool d'adresses et des annonces L2 pour les services LoadBalancer ;
- les passerelles : les CRD de Gateway API, agentgateway comme implémentation, et plusieurs Gateways. Les accès publics passent par une passerelle dédiée, séparée de l'accès local ;
- les certificats : cert-manager et des émetteurs Let's Encrypt ;
- les secrets : External Secrets synchronise les secrets depuis un gestionnaire externe, et aucun secret n'est stocké dans le dépôt ;
- le stockage local : local-path-provisioner, sur les workers, sans réplication ;
- les métriques et l'observabilité : metrics-server, puis la stack VictoriaMetrics avec Grafana ;
- les outils des agents : des serveurs MCP, et le moteur kagent.

`apps/workloads/` contient les usages : le blog, la domotique (Home Assistant) et les agents IA. Le moteur kagent est une brique commune, mais les agents eux-mêmes sont des manifests rangés avec les usages. Leur architecture tient en peu de mots : les agents n'appellent ni les fournisseurs de modèles ni les outils en direct, tout passe par une passerelle interne qui sert aussi les serveurs MCP.

Les annotations `sync-wave` fixent l'ordre dans lequel la racine crée les Applications. Les plus basses passent d'abord : Cilium et Argo CD, puis les CRD de Gateway API et le pool L2, puis les CRD d'agentgateway et de kagent. Viennent ensuite les contrôleurs (agentgateway, cert-manager, External Secrets, metrics-server, le stockage local), puis ce qui a besoin d'eux : les Gateways, les émetteurs de certificats, la configuration d'External Secrets, kagent. Le monitoring, les serveurs MCP et les usages arrivent en dernier.

```yaml
# apps/shared/agentgateway.yaml (simplifié)
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: agentgateway
  namespace: argocd
  labels:
    homelab/layer: shared
  annotations:
    argocd.argoproj.io/sync-wave: "0"
spec:
  project: default
  source:
    repoURL: cr.agentgateway.dev/charts
    chart: agentgateway
    targetRevision: <version>
    helm:
      valuesObject:
        controller:
          replicaCount: 1
  destination:
    server: https://kubernetes.default.svc
    namespace: agentgateway-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

Les CRD d'agentgateway ont leur propre Application, dans la vague juste avant. Je les sépare du chart du contrôleur pour qu'elles existent avant les objets qui s'en servent, et pour pouvoir leur interdire le `prune`, ce que je détaille plus bas.

## Où vit le contenu

Les Applications ne contiennent presque rien : `apps/` ne range que des définitions d'Application. Le contenu est ailleurs, et la convention est simple : un composant, un dossier.

```text
argocd/        installation d'Argo CD, Application racine, projets
apps/
  shared/      Applications des briques communes
  workloads/   Applications des usages
shared/        values et manifests des briques communes, un dossier par composant
manifests/     manifests des usages, un dossier par application
talos/         patches Talos (voir l'article précédent)
renovate.json5
```

Une Application pointe vers l'un ou l'autre de deux formats. Le premier est un chart Helm amont avec des values qui viennent du dépôt. L'Application a alors plusieurs `spec.sources` : le chart, puis le dépôt lui-même déclaré avec `ref: values`, que le champ `valueFiles` lit sous la forme `$values/shared/<composant>/values.yaml`. Plusieurs Applications fonctionnent ainsi, comme `argocd`, `cilium` ou le monitoring. D'autres écrivent leurs values en ligne dans un `valuesObject`, comme l'exemple de la section précédente.

Quand un dossier mélange values Helm et manifests bruts, l'Application qui lit les manifests doit exclure le fichier de values, qui n'est pas un manifest Kubernetes :

```yaml
# extrait d'une Application de manifests d'apps/shared/
  source:
    repoURL: <dépôt privé platform>
    targetRevision: main
    path: shared/<composant>
    directory:
      exclude: values.yaml   # valeurs Helm, pas un manifest Kubernetes
```

Certains composants sont découpés en deux Applications qui lisent le même dossier : le chart d'un côté, ses ressources de l'autre. Cilium et son pool L2 en sont un exemple, cert-manager et ses émetteurs un autre. Les ressources attendent ainsi les CRD du chart, grâce aux vagues.

Le second format est un dossier de manifests, sans chart. C'est le cas du blog :

```yaml
# apps/workloads/blog.yaml (simplifié)
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: blog
  namespace: argocd
  labels:
    homelab/layer: workloads
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  annotations:
    argocd.argoproj.io/sync-wave: "2"
spec:
  project: default
  source:
    repoURL: <dépôt privé platform>
    targetRevision: main
    path: manifests/blog
  destination:
    server: https://kubernetes.default.svc
    namespace: blog
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

Ici, pas de `exclude` : il n'y a pas de fichier de values dans ce dossier. Le finalizer, lui, varie d'une Application à l'autre. Celui-ci supprime les ressources du blog si l'Application disparaît. Les Applications des usages que j'ai lues en ont un, comme plusieurs serveurs MCP ; celles de la couche réseau et des certificats n'en ont pas.

Une dernière chose pratique : une clé inconnue dans un fichier de values est ignorée sans erreur. Pour vérifier ce qu'un chart génère vraiment, j'utilise `helm template` avec le fichier de values du dépôt.

## Renovate ouvre les PR de mise à jour

Renovate lit `renovate.json5` et ouvre des PR pour les versions de charts, dans les Applications d'`apps/` (charts Helm HTTP et OCI, sources git taguées), et pour les images de conteneur des manifests dans `manifests/`. Il passe le samedi matin et attend trois jours après la sortie d'une release avant de fusionner lui-même les montées mineures, patch et digest. Les montées majeures attendent mon accord dans le Dependency Dashboard. Cilium est un cas à part : une mise à jour redémarre le réseau de tous les nœuds, donc seuls les patchs sont fusionnés automatiquement.

```json5
// renovate.json5 (extrait)
schedule: ['* 6-12 * * 6'], // le samedi matin
automerge: true,
ignoreTests: true,          // pas de CI dans le dépôt
minimumReleaseAge: '3 days',

packageRules: [
  {
    // Montées de version majeures : à relire attentivement
    matchUpdateTypes: ['major'],
    dependencyDashboardApproval: true,
    automerge: false,
  },
  {
    // Cilium : seuls les patchs sont fusionnés automatiquement
    matchPackageNames: ['cilium'],
    matchUpdateTypes: ['minor'],
    automerge: false,
  },
],
```

Deux règles sortent du lot. agentgateway et ses CRD sont groupés dans une même PR, parce qu'ils doivent changer de version ensemble. L'image du blog, elle, n'a ni planning ni délai : c'est mon propre code, déjà relu dans la PR du blog. Les PR de l'image sont fusionnées quelques secondes après leur création.

J'ai regardé les PR récentes, et elles ne collent pas tout à fait au planning. Le 6 novembre, la première PR sur le chart d'Argo CD est arrivée avec l'automerge désactivé, et je l'ai fusionnée à la main à 19 h 50 UTC. La règle d'automerge est arrivée le même soir, à 20 h 03 UTC. Le samedi 7 novembre, deux PR (le chart d'Argo CD, puis l'image de Postgres) ont été créées à 21 h 38 UTC et fusionnées par Renovate en quelques secondes. Ce n'est pas le samedi matin, et je ne sais pas encore pourquoi. Je n'ai pas non plus vérifié l'âge des releases concernées par rapport au délai de trois jours.

Les tags d'image écrits dans un `valuesObject` en ligne ne sont pas suivis. Talos, Kubernetes et l'extension Newt non plus : je les mets à jour à la main.

## Ce qui marche, ce qui est pénible

Ajouter une application tient en deux gestes : un dossier de manifests, et un fichier d'Application dans `apps/workloads/`. La racine fait le reste.

Les CRD sont le premier point pénible. Les Applications qui ne portent que des CRD (Gateway API, agentgateway, kagent) ont `prune: false`, et le commentaire du fichier de Gateway API dit « ne jamais supprimer des CRD automatiquement ». Du côté de cert-manager, c'est `crds.keep: true`. Supprimer une CRD supprime tous les objets qui en dépendent, donc je préfère le faire moi-même. Le revers est que ce qui disparaît du dépôt reste dans le cluster tant que je ne passe pas derrière. Ces Applications utilisent aussi `ServerSideApply`, parce que les CRD de Gateway API sont trop grosses pour l'annotation `last-applied`.

Les contrôleurs qui modifient leurs propres ressources fabriquent de fausses dérives. Cert-manager injecte le `caBundle` des webhooks, External Secrets aussi : sans `ignoreDifferences`, Argo CD les verrait comme un écart permanent. Pour Cilium, les certificats de Hubble sont générés par un Job, parce que Helm en produirait de nouveaux à chaque rendu et qu'Argo CD verrait un changement à chaque comparaison.

Le monitoring n'a pas de persistance. VictoriaMetrics garde 7 jours de données dans un `emptyDir`, avec un scrape toutes les 60 secondes, pour ménager les cartes SD. L'historique est perdu quand le pod redémarre.

Il n'y a pas de CI dans le dépôt. Renovate ignore donc les tests, et le délai de trois jours sert de garde-fou avant l'automerge.

Le dernier piège date du 8 novembre. J'avais mis `providers: null` dans le `valuesObject` de kagent pour supprimer le ModelConfig par défaut du chart. Argo CD retire les valeurs `null` d'un `valuesObject`, et le chart recréait un ModelConfig OpenAI par défaut, en échec faute de secret. Le commit de correction déplace la valeur dans `helm.values`, en texte, où le `null` arrive intact jusqu'à Helm.
