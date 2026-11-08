---
title: "Talos sur trois Raspberry Pi : une image par rôle, et ce que l'extension Newt a cassé"
description: "Trois Raspberry Pi sous Talos Linux : fabriquer l'image avec Image Factory, la flasher à la main, et corriger des workers qui redémarraient à intervalle régulier à cause de l'extension Newt."
pubDate: 2026-11-08
tags: ['talos', 'raspberry pi', 'homelab', 'kubernetes']
draft: false
writtenBy: 'Pippin'
reviewedBy: ['Galadriel', 'Sam', 'Legolas']
---

Le dashboard Grafana que j'avais déjà installé montrait des coupures à intervalles réguliers sur mes workers : un redémarrage environ toutes les 71 minutes. La cause se trouvait dans l'image Talos que j'avais fabriquée pour eux, avec une extension qui n'avait rien à y faire.

## Le point de départ

Il n'y avait aucune infrastructure avant le 4 novembre 2026 : j'ai commencé à installer le homelab ce jour-là. Le cluster tient sur trois Raspberry Pi 4B arm64 de 8 Go de RAM chacun : un control plane, qui accepte aussi du workload, et deux workers. C'est un cluster de test. L'OS est Talos Linux v1.14.5, avec Kubernetes v1.37.1.

J'ai choisi Talos pour sa légèreté. Sur des Raspberry Pi aux ressources limitées, je ne voulais pas d'un OS chargé de fonctionnalités qui ne me servent à rien. Il y a aussi la praticité : tout est dans des fichiers de configuration, ce qui colle avec le côté GitOps du reste du cluster.

## Fabriquer l'image

Talos s'installe depuis une image produite par Image Factory à partir d'un schematic. J'ai créé le mien avec l'interface web. Il contient l'overlay Raspberry Pi `rpi_generic` (celui de `siderolabs/sbc-raspberrypi`) et l'extension `siderolabs/newt`.

Newt est le côté cluster d'un tunnel vers un serveur Pangolin, hébergé sur un VPS. Je l'ai mis dans l'hôte plutôt que dans un pod : il fait partie du système, et ça fait un pod de moins à faire tourner sur mes machines.

L'image est référencée dans un `UnattendedInstallConfig`, versionné dans le dépôt :

```yaml
# talos/installer-controlplane.yaml
# Schematic Image Factory :
#   overlay: { image: siderolabs/sbc-raspberrypi, name: rpi_generic }
#   customization.systemExtensions.officialExtensions: [siderolabs/newt]
apiVersion: v1alpha1
kind: UnattendedInstallConfig
installer:
  image: factory.talos.dev/metal-installer/<schematic-id>:v1.14.5
```

Au départ, j'avais une seule image, avec Newt, pour les trois nœuds. La séparation par rôle n'est arrivée que le 5 novembre.

## Faire booter les Raspberry Pi

Sur chacun des trois Pi, j'ai flashé l'image Talos sur une carte SD avec `dd`, depuis ma machine. Le nœud démarre ensuite en mode maintenance, en attente de sa configuration. Les nœuds ont des adresses fixes côté réseau domestique.

La configuration est générée avec `talosctl gen config`, en empilant des patches par rôle (commande simplifiée) :

```bash
cd talos
talosctl gen config homelab https://<endpoint-du-control-plane>:6443 \
  --with-secrets <fichier-hors-depot> \
  --config-patch @patch.yaml \
  --config-patch-control-plane @controlplane-schedulable.yaml \
  --config-patch-control-plane @installer-controlplane.yaml \
  --config-patch-worker @installer-worker.yaml \
  --config-patch-worker @worker-local-path.yaml \
  --config-patch-control-plane @<config-newt-hors-depot>
```

La PKI du cluster, l'accès admin à l'API Talos et la config de Newt restent hors dépôt, dans un coffre personnel. Les configs générées sont ignorées par Git, parce qu'elles contiennent toute la PKI.

Reste à envoyer la configuration à chaque nœud, puis à initialiser le cluster :

```bash
talosctl apply-config --insecure -n <ip-control-plane> --file controlplane.yaml
talosctl apply-config --insecure -n <ip-worker-1> --file worker.yaml
talosctl apply-config --insecure -n <ip-worker-2> --file worker.yaml

talosctl -n <ip-control-plane> bootstrap   # une seule fois, sur le control plane
```

Ensuite, les nœuds restent `NotReady` tant qu'il n'y a pas de CNI. C'est normal : `patch.yaml` supprime Flannel, et j'installe Cilium juste après.

## Des workers qui redémarrent toutes les 71 minutes

Les workers avaient reçu l'image avec l'extension Newt, alors que la config de Newt n'est appliquée qu'au control plane. Une extension Newt sans `ExtensionServiceConfig` ne démarre jamais. Talos reste alors au stage `booting` et redémarre le nœud quand le `BootTimeout` expire (70 minutes). D'où les coupures régulières vues dans Grafana. Je ne sais pas expliquer le mécanisme exact du blocage.

Les coupures ont commencé dès la première installation, le 4 novembre. Elles ont duré jusqu'à la correction du 5 novembre : j'ai fabriqué un deuxième schematic, avec le même overlay Raspberry Pi mais sans Newt. Les workers installent maintenant celui-là :

```yaml
# talos/installer-worker.yaml
# Schematic Image Factory :
#   overlay: { image: siderolabs/sbc-raspberrypi, name: rpi_generic }
apiVersion: v1alpha1
kind: UnattendedInstallConfig
installer:
  image: factory.talos.dev/metal-installer/<schematic-id>:v1.14.5
```

Newt n'est plus que sur le control plane, qui reçoit aussi sa configuration.

## Les patches de configuration

Tout est dans `talos/`.

Le commit initial du 4 novembre contient `patch.yaml` :

```yaml
# talos/patch.yaml
apiVersion: v1alpha1
kind: KubeFlannelCNIConfig
$patch: delete
---
apiVersion: v1alpha1
kind: KubeProxyConfig
enabled: false
```

Le premier document supprime Flannel, le CNI par défaut. Le second désactive kube-proxy. Je voulais installer Cilium à la place : il gère le réseau des pods et remplace aussi kube-proxy (`kubeProxyReplacement: true` dans ses values, Cilium 1.20.4). J'installe Cilium avec Helm juste après le `bootstrap` : il pose le CNI, les pods démarrent et les nœuds passent `Ready`.

Un commit suivant du 4 novembre ajoute `controlplane-schedulable.yaml`, qui retire la taint `NoSchedule` du control plane et lui permet d'accueillir du workload :

```yaml
# talos/controlplane-schedulable.yaml
apiVersion: v1alpha1
kind: KubeNodeConfig
taints:
  node-role.kubernetes.io/control-plane:
    $patch: delete
```

Un commit du soir du 4 novembre ajoute `worker-local-path.yaml`, un volume pour local-path-provisioner :

```yaml
# talos/worker-local-path.yaml
apiVersion: v1alpha1
kind: UserVolumeConfig
name: local-path-provisioner
volumeType: directory
```

C'est un volume utilisateur de type `directory` sur la partition EPHEMERAL existante, donc sans repartitionner la carte SD. Talos le monte dans `/var/mnt/local-path-provisioner`, visible du kubelet. Il n'est appliqué qu'aux workers, pour garder le stockage hors du control plane. La StorageClass `local-path` est restreinte aux workers par `allowedTopologies`. Le stockage est local au nœud.

## Les pièges de l'upgrade et des patches

Pour mettre Talos à jour, il faut toujours passer `--image` à `talosctl upgrade`, avec l'image du rôle (celles de `talos/installer-*.yaml`). L'image par défaut de la commande est générique, sans l'overlay Raspberry Pi ni Newt. Renovate ne suit ni Talos ni Kubernetes (le dossier `talos/`), ni l'extension Newt : je mets ces versions à jour à la main.

Autre piège : les patches **ajoutent** aux listes au lieu de les remplacer. L'exemple noté dans le README : l'`environment` de Newt. Je vérifie donc toujours avec `--dry-run` avant d'appliquer :

```bash
talosctl patch mc -n <ip> --patch @talos/<patch>.yaml --dry-run
talosctl patch mc -n <ip> --patch @talos/<patch>.yaml
```

Pour changer la config de Newt, je la supprime puis je la réapplique. Le fichier de suppression est `newt-delete.yaml`, du commit initial :

```yaml
# talos/newt-delete.yaml
apiVersion: v1alpha1
kind: ExtensionServiceConfig
name: newt
$patch: delete
```

```bash
talosctl -n <ip-control-plane> patch mc --patch @talos/newt-delete.yaml
talosctl -n <ip-control-plane> patch mc --patch @<config-newt-hors-depot>
```
