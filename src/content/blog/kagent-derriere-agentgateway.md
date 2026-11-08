---
title: "Tester kagent derrière agentgateway : agents isolés, galères TLS et ConfigMap"
description: "Première intégration de kagent derrière la gateway IA : un agent GitHub lecture seule, une galère TLS, puis consignes déplacées en ConfigMap. Ce que ça a vraiment cassé."
pubDate: 2026-11-08
tags: ["kagent", "kubernetes", "homelab", "gateway", "mcp"]
draft: true
writtenBy: 'Pippin'
reviewedBy: []
---

J’ai voulu tester kagent dans le cluster, avec comme seule porte d’entrée la gateway IA (agentgateway), pour voir ce que donnait une stack d’agent Kubernetes branchée sur le vrai homelab, mais bien isolée. L’idée : remplacer Paperclip sur les agents, ou le compléter pour les actions et la génération d’articles plus structurée.

Je prends Bilbo comme cobaye : un agent GitHub en lecture seule. Il ne peut rien merger, et aucune action hors GitHub. MCP côté gateway, clé d’agent spécifique. L’objectif était de voir où ça coince, sans casser le reste du cluster.

## Un agent GitHub isolé, déployé par kagent

Pour ce test, je suis parti sur kagent 0.10.6. Le contrôleur et l’UI sont déployés par Helm, avec la base Postgres embarquée. Tout est désactivé sauf le strict minimum :

- aucun agent d’exemple ni kmcp,
- uniquement l’agent Bilbo,
- pas de grafana-mcp ni de dashboard spécial.

Le chart expose trois deployments, compatible avec le policy `restricted` du cluster, et n’installe aucun agent par défaut. J’ai ajouté le dépôt OCI dans Argo :

```yaml
# argocd/install/repo-kagent-oci.yaml
apiVersion: argoproj.io/v1alpha1
kind: Repository
metadata:
  name: repo-kagent-oci
spec:
  type: helm
  url: oci://une-registry-oci
```

Bilbo, côté kagent :

```yaml
# manifests/kagent/agent-bilbo.yaml
apiVersion: agent.evann.dev/v1alpha1
kind: Agent
metadata:
  name: bilbo
spec:
  systemMessageFrom: configmap/agent-prompts/bilbo.md
  tools:
    - github_get_file_contents
    - github_list_commits
    - github_get_commit
    - github_list_pull_requests
    - github_pull_request_read
  mcp:
    remoteServer: http://ai.gateway-ai.svc.cluster.local:8080/mcp
    apiKeySecretRef:
      name: kagent-bilbo-gateway-key
      key: api-key
```

La clé `kagent-bilbo-gateway-key` (stockée dans Bitwarden, jamais en clair dans le repo) n’a accès qu’aux outils GitHub en lecture.

Tout passe par le contrôleur MCP distant, sur la gateway : un RemoteMCPServer du côté de kagent, pointé vers la gateway, et une configuration explicite du MCP sur la gateway pour ce namespace. La CNP du cluster limite finement ce qui peut sortir.

Prompt utilisé pour tester : « Résume les commits de EvannDev/platform des 7 derniers jours et propose 3 sujets d’article. ». Je surveille les logs de la gateway pour m’assurer que les appels sortent bien du pod Bilbo, avec la clé dédiée, vers le port MCP.

## Échec complet : handshake TLS impossible et DNS qui ment

Premier essai : échec. La découverte des outils échoue, avec dans les logs :

```
tls: handshake failure
```

Impossible de discuter en HTTPS avec la gateway, alors que Bilbo est censé appeler `ai.homelab.evann-deb.fr`.

Problème : ce nom DNS résout, pour tous les pods, vers l’IP générique du wildcard du cluster (`*.homelab`). Sauf que la gateway IA, elle, écoute sur une IP dédiée. Paperclip triche en injectant un hostAliases, mais kagent (0.10.6) ne laisse pas patcher l’entrypoint de ses pods.

J’analyse les solutions. Modifier le DNS à l’échelle du cluster devient vite sale, et je veux éviter d’exposer un endpoint interne du cluster à l’extérieur. Une alternative serait un enregistrement Cloudflare bricolé, mais je cherche plus simple.

## Solution : ouvrir une écoute HTTP interne spécifique pour MCP

Je configure alors la gateway pour écouter aussi en HTTP sur un port interne, sur une adresse réservée au cluster :

```yaml
# manifests/gateway-ai/gateway.yaml
spec:
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      # … rien ne bouge pour Paperclip
    - name: http-internal
      protocol: HTTP
      port: 8080
      hostname: ai.gateway-ai.svc.cluster.local
```

Et la `HTTPRoute` associée :

```yaml
# manifests/gateway-ai/mcp.yaml
spec:
  parentRefs:
    - name: gateway-ai
      sectionName: http-internal
    - name: gateway-ai
      sectionName: https
  rules:
    # MCP passera par les deux, Anthropic reste HTTPS seulement
```

Le résultat, c’est que Bilbo (et tous les agents kagent) appellent la gateway sur `http://ai.gateway-ai.svc.cluster.local:8080/mcp`. La CNP du namespace kagent limite ce flux à ce port ; Paperclip continue en TLS sur 443. Ce n’est pas idéal, car la clé d’agent circule en clair à l’intérieur du cluster, mais j’assume ce compromis pour ce test.

Après cette correction, la découverte des outils passe, les requêtes s’auditent comme prévu sur la gateway, et les logs tracent bien la clé agent dédiée.

## Refactor : consignes système extraites en ConfigMap

Deuxième round : une fois que Bilbo exécutait ses prompts de lecture sur GitHub, j’ai préparé le cas d’un agent « écriture » (Pippin). La config d’origine posait problème : les consignes, avant, étaient écrites en dur dans le manifest de chaque agent. Avec plusieurs agents (et plusieurs rôles d’écriture), ça se gère mal.

Changement d’approche : toutes les consignes systèmes sont extraites en fichiers Markdown dans `prompts/`, puis montées en ConfigMap générée par Kustomize. Chaque agent lit le fichier qui lui correspond :

```yaml
# manifests/kagent/kustomization.yaml
configMapGenerator:
  - name: agent-prompts
    files:
      - bilbo.md=prompts/bilbo.md
      - pippin.md=prompts/pippin.md
      - commun.md=prompts/commun.md
```

Dans le manifest de chaque agent :

```yaml
# manifests/kagent/agent-pippin.yaml
spec:
  systemMessageFrom: configmap/agent-prompts/pippin.md
```

J’en profite pour factoriser les parties communes : via `promptTemplate` et l’inclusion du fichier `commun.md` par le moteur de template natif de kagent (0.10.6).

```yaml
promptTemplate: |-
  {{ include("prompts/commun.md") }}
  [consigne spécifique à l’agent]
```

Plus lisible, versionnable et partageable qu’avant.

## Ce qui reste imparfait et à surveiller

- Les clés transitent en clair sur le réseau interne (seulement dans le namespace “kagent”, voulu pour le test).
- La 0.10.6 ne permet pas de patcher les podSpecs ni d’ajouter des patchs DNS : seuls les hostAliases Paperclip échappaient à cette limite ; sur les versions 1.x, la stratégie change (Substrate/mTLS, plus lourd, pas dispo sur ARM64 encore).
- Pas de CNP dédiée au namespace kagent pour l’instant (je surveille côté Argo).
- Les consignes mutualisées sont reload dès que la ConfigMap change, mais pas de rollback automatique si jamais une consigne part en vrille (le contrôleur redéploie tout).


## Sources

- [EvannDev/platform PR #12](https://github.com/EvannDev/platform/pull/12)
- [EvannDev/platform PR #15](https://github.com/EvannDev/platform/pull/15)
- [EvannDev/platform PR #16](https://github.com/EvannDev/platform/pull/16)


