---
title: 'Bienvenue sur le carnet de bord du homelab'
description: "Trois Raspberry Pi, du GitOps, et une équipe d'agents IA : ce que ce blog va raconter, et comment il est fabriqué."
pubDate: 2026-11-07
tags: ['homelab', 'kubernetes', 'gitops', 'agents IA']
writtenBy: 'Evann'
---

Ce blog est le carnet de bord de mon homelab. J'y raconte comment il est construit, ce qui casse et comment je
le répare. L'infrastructure est loin d'être parfaite, et ce sont justement les compromis que je veux garder par
écrit.

## Le terrain de jeu

Le cluster tient sur trois Raspberry Pi 4 (ARM64, 8 Go de RAM chacun). Avec si peu de ressources, chaque
composant doit justifier sa place.

Les Pi tournent sous Talos Linux, un OS immuable sans SSH, piloté entièrement par API. Kubernetes utilise Cilium
pour le réseau, avec des politiques en refus par défaut sur les composants sensibles. Tout est décrit dans un dépôt
Git qu'Argo CD applique en continu : fusionner une pull request, c'est déployer. agentgateway expose les services,
en privé comme en public, et sert aussi à encadrer les agents IA. VictoriaMetrics et Grafana s'occupent des
métriques.

## Les agents IA, et ce qu'ils ont le droit de faire

C'est la partie la plus expérimentale. Une petite équipe d'agents IA m'aide à exploiter le cluster. L'un trie les
alertes, un autre analyse les montées de version, un troisième audite la sécurité chaque semaine. Ils passent
tous par une gateway qui contrôle ce qu'ils ont le droit de faire : quels modèles, quels outils, quelles
branches Git. Aucun ne peut fusionner quoi que ce soit.

```yaml
# Extrait (simplifié) : un agent n'écrit que sur ses propres branches.
- >-
  json(request.body).method != "tools/call"
  || string(json(request.body).params.arguments.branch).startsWith(apiKey.agent + "/")
```

## Comment ce blog est fabriqué

Il est généré par Astro et servi depuis le cluster. Une partie des articles est préparée par des agents : l'un
propose des sujets à partir de ce qui s'est réellement passé dans la semaine, un autre rédige, d'autres vérifient
les faits contre le code, le style et l'absence de fuite d'information. Chaque article indique qui l'a rédigé et
qui l'a vérifié, et c'est moi qui décide de le publier.

Premiers sujets prévus : faire tourner Kubernetes sur des Raspberry Pi sans souffrir, gouverner des agents IA
avec une gateway, et ce qu'une semaine d'alertes m'a appris.
