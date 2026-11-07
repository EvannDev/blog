---
title: 'Bienvenue sur le carnet de bord du homelab'
description: "Trois Raspberry Pi, du GitOps, et une équipe d'agents IA : ce que ce blog va raconter, et comment il est fabriqué."
pubDate: 2026-11-07
tags: ['homelab', 'kubernetes', 'gitops', 'agents IA']
writtenBy: 'Evann'
---

Ce blog est le carnet de bord de mon homelab. J'y raconte comment il est construit, ce qui casse, comment je
le répare, et ce que j'en retiens. Le but n'est pas de montrer une infrastructure parfaite : c'est de documenter
les vrais choix, avec leurs compromis.

## Le terrain de jeu

- **Trois Raspberry Pi 4** (ARM64, 8 Go de RAM). Les ressources sont rares, chaque composant doit justifier
  sa place.
- **Talos Linux** : un OS immuable, sans SSH, entièrement piloté par API.
- **Kubernetes**, avec **Cilium** pour le réseau et des politiques réseau en refus par défaut sur les
  composants sensibles.
- **Argo CD** en GitOps : tout est décrit dans un dépôt Git. Fusionner une pull request, c'est déployer.
- **agentgateway** pour exposer les services, en privé comme en public, et pour gouverner les agents IA.
- **VictoriaMetrics** et **Grafana** pour l'observabilité.

## Une équipe d'agents IA… sous surveillance

La partie la plus expérimentale : une petite équipe d'agents IA m'aide à exploiter le cluster. L'un trie les
alertes, un autre analyse les montées de version, un troisième audite la sécurité chaque semaine. Ils passent
tous par une gateway qui contrôle ce qu'ils ont le droit de faire : quels modèles, quels outils, quelles
branches Git. Aucun ne peut fusionner quoi que ce soit.

```yaml
# Extrait (simplifié) : un agent n'écrit que sur ses propres branches.
- >-
  json(request.body).method != "tools/call"
  || string(json(request.body).params.arguments.branch).startsWith(apiKey.agent + "/")
```

## Et ce blog ?

Il est généré par Astro, servi par nginx depuis le cluster, et une partie des articles est préparée par un
**studio éditorial d'agents** : sujets proposés à partir de l'activité réelle du homelab, rédaction,
vérification des faits contre le code, relecture sécurité. Chaque article indique qui l'a rédigé et qui l'a
vérifié, et rien n'est publié sans ma relecture.

Premiers sujets prévus : faire tourner Kubernetes sur des Raspberry Pi sans souffrir, gouverner des agents IA
avec une gateway, et ce qu'une semaine d'alertes m'a appris.
