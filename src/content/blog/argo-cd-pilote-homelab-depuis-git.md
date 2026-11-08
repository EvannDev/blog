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

Pour changer quelque chose sur le cluster, je ne lance ni `helm upgrade` ni `kubectl edit` : je fais un commit sur `main` de mon dépôt platform. Ce dépôt est privé et décrit ce qui tourne. Argo CD compare son contenu avec le cluster et corrige l'écart. Si je modifie une release à la main, `selfHeal` la remet dans l'état du dépôt.

Fusionner une PR sur `main` revient à déployer, y compris pour les mises à jour de versions. Pour le blog, une fusion sur son dépôt construit une image, puis une PR sur platform change la version déployée.

Le premier commit de platform date du 4 novembre 2026 : des patches Talos, Cilium, Argo CD et Gateway API avec agentgateway. Le 6 novembre, je l'ai restructuré en monorepo Argo CD, avec une Application racine récursive à la place d'un dossier d'amorçage. Les Applications ont gardé leur nom, pour qu'Argo CD ne les recrée pas.

## Amorcer : Argo CD, puis l'Application racine

Argo CD ne peut pas se déployer lui-même à partir de rien. Sur des nœuds Talos neufs, rien ne démarre sans CNI (c'est dans [l'article sur Talos](/blog/talos-trois-raspberry-pi-une-image-par-role/)). J'installe donc Cilium, puis Argo CD, avec Helm, une seule fois et à la main, avec les values déjà présentes dans le dépôt.

Il reste un problème d'œuf et de poule : Argo CD doit lire un dépôt privé, et External Secrets n'est pas encore là pour lui fournir l'accès. Je crée donc à la main les secrets d'amorçage, dont l'identifiant d'accès au dépôt. Quand External Secrets tourne, il reprend cet identifiant depuis le gestionnaire de secrets externe.

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

Elle lit `apps/` en récursif. Un fichier d'Application ajouté dans ce dossier est déployé sans autre geste, et `prune` supprime ce qui disparaît du dépôt.

Argo CD et Cilium sont ensuite repris par deux Applications, `argocd` et `cilium`, qui adoptent les releases Helm déjà installées. Elles n'ont pas de finalizer, et leur commentaire le dit : supprimer l'Application ne supprime pas le composant.

## Deux couches : briques communes et usages

Sous `apps/`, deux dossiers, `shared/` et `workloads/`. Chaque Application porte un label `homelab/layer` qui dit dans quelle couche elle est.

`apps/shared/` contient les briques communes :

- le réseau : Cilium comme CNI, plus un pool d'adresses et des annonces L2 pour les services LoadBalancer ;
- les passerelles : les CRD de Gateway API, agentgateway comme implémentation, et plusieurs Gateways. Les accès publics passent par une passerelle dédiée, séparée de l'accès local ;
- les certificats : cert-manager et des émetteurs Let's Encrypt ;
- les secrets : External Secrets les synchronise depuis un gestionnaire externe, et aucun secret n'est stocké dans le dépôt ;
- le stockage local : local-path-provisioner, sur les workers ;
- les métriques et l'observabilité : metrics-server, puis la stack VictoriaMetrics avec Grafana ;
- les outils des agents : des serveurs MCP, et le moteur kagent.

`apps/workloads/` contient les usages : le blog, la domotique (Home Assistant) et les agents IA. Le moteur kagent est une brique commune, mais les agents eux-mêmes sont des manifests rangés avec les usages. Ils ne parlent ni aux fournisseurs de modèles ni aux outils en direct : tout passe par une passerelle interne.

Les annotations `sync-wave` fixent l'ordre de création. Les vagues les plus basses passent d'abord : Cilium et Argo CD, puis les CRD de Gateway API et le pool L2, puis les CRD d'agentgateway et de kagent. Viennent ensuite les contrôleurs (agentgateway, cert-manager, External Secrets, metrics-server, le stockage local), puis ce qui a besoin d'eux : les Gateways, les émetteurs de certificats, la configuration d'External Secrets, kagent. Le monitoring, les serveurs MCP et les usages arrivent en dernier.

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

Les CRD d'agentgateway ont leur propre Application, dans la vague juste avant. Je les sépare du chart du contrôleur pour qu'elles existent avant les objets qui s'en servent, et pour pouvoir leur interdire le `prune`.

## Où vit le contenu

`apps/` ne range que des définitions d'Application. Le contenu est ailleurs, avec une convention simple : un composant, un dossier.

```text
argocd/        installation d'Argo CD et Application racine
apps/
  shared/      Applications des briques communes
  workloads/   Applications des usages
shared/        values et manifests des briques communes
manifests/     manifests des usages
```

Une Application pointe vers l'un de deux formats. Le premier est un chart Helm amont avec des values qui viennent du dépôt. Elle a alors plusieurs `spec.sources` : le chart, puis le dépôt lui-même déclaré avec `ref: values`, que `valueFiles` lit sous la forme `$values/shared/<composant>/values.yaml`. Argo CD, Cilium et le monitoring fonctionnent ainsi. D'autres Applications écrivent leurs values en ligne dans un `valuesObject`, comme l'exemple de la section précédente.

Certains composants sont découpés en deux Applications qui lisent le même dossier : le chart d'un côté, ses ressources de l'autre. Cilium et son pool L2 en sont un exemple, cert-manager et ses émetteurs un autre. Comme le dossier contient aussi le fichier de values, l'Application qui lit les manifests l'exclut :

```yaml
# extrait d'une Application de manifests d'apps/shared/
  source:
    repoURL: <dépôt privé platform>
    targetRevision: main
    path: shared/<composant>
    directory:
      exclude: values.yaml   # valeurs Helm, pas un manifest Kubernetes
```

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

Ici, pas de `exclude` : ce dossier n'a pas de fichier de values. Le finalizer, lui, varie selon les Applications. Celui du blog supprime ses ressources si l'Application disparaît.

Une clé inconnue dans un fichier de values est ignorée sans erreur. Pour vérifier ce qu'un chart génère vraiment, j'utilise `helm template` avec le fichier de values du dépôt.

## Renovate ouvre les PR de mise à jour

Renovate lit `renovate.json5` et ouvre des PR pour les versions de charts, dans les Applications d'`apps/` (charts Helm HTTP et OCI, sources git taguées), et pour les images de conteneur des manifests. Il passe le samedi matin. Les montées mineures, patch et digest sont fusionnées automatiquement trois jours après la sortie de la release, et les montées majeures attendent ma validation à la main. Cilium est un cas à part : une mise à jour redémarre le réseau de tous les nœuds, donc seuls les patchs sont fusionnés automatiquement.

```json5
// renovate.json5 (extrait)
schedule: ['* 6-12 * * 6'], // le samedi matin
automerge: true,
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

agentgateway et ses CRD sont groupés dans une même PR, parce qu'ils doivent changer de version ensemble. Renovate ne suit pas les tags d'image écrits dans un `valuesObject` en ligne. Talos, Kubernetes et les composants d'accès externe sont mis à jour à la main.

## Ce qui marche, ce qui est pénible

Ajouter une application tient en deux gestes : un dossier de manifests, et un fichier d'Application dans `apps/workloads/`. La racine fait le reste.

Les CRD m'ont demandé un compromis. Les Applications qui ne portent que des CRD (Gateway API, agentgateway, kagent) ont `prune: false`, et le commentaire du fichier de Gateway API dit « ne jamais supprimer des CRD automatiquement ». Du côté de cert-manager, c'est `crds.keep: true`. Supprimer une CRD supprime tous les objets qui en dépendent, donc je préfère le faire moi-même. En contrepartie, ce qui disparaît du dépôt reste dans le cluster tant que je ne passe pas derrière. Ces Applications utilisent aussi `ServerSideApply`, parce que les CRD de Gateway API sont trop grosses pour l'annotation `last-applied`.

Argo CD a aussi besoin de réglages quand un autre contrôleur modifie les ressources qu'il gère. Les Applications du monitoring et d'External Secrets déclarent un `ignoreDifferences` sur le `caBundle` des webhooks, injecté par cert-manager pour l'une et par un contrôleur d'External Secrets pour l'autre. Sans lui, Argo CD y verrait un écart permanent.

Pour le monitoring, j'ai limité la persistance des métriques : l'historique ne survit pas à tous les redémarrages.

Le 8 novembre, un autre piège m'a coûté un commit. J'avais mis `providers: null` dans le `valuesObject` de kagent pour supprimer le ModelConfig par défaut du chart. Argo CD retire les valeurs `null` d'un `valuesObject`, et le chart recréait un ModelConfig OpenAI par défaut, en échec faute de secret. Le commit de correction déplace la valeur dans `helm.values`, en texte, où le `null` arrive intact jusqu'à Helm.
