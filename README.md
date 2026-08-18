# WhatsApp Backup Viewer (Angular)

Aplicació Angular (CLI 22.x) per visualitzar exportacions de grups de WhatsApp.

## Característiques

- Analitza el fitxer _chat.txt al cantó del client (sense servidor backend).
- Filtres per participant, cerca de text i filtre multimèdia.
- Estadístiques en temps real sobre les dades filtrades.
- Gràfiques amb Chart.js:
  - Activitat per participant (barres)
  - Distribució d'adjunts (circular)
  - Activitat horària (línia)
  - Activitat diària (línia)
- Visualització de la conversa amb separadors de data i previsualització d'imatges, vídeos i àudios quan es carrega l'adjunt.

## Requisits

- Node.js 20+
- npm 10+

## Execució

```bash
npm install
npm start
```

Després obre <http://localhost:4200/>

## Com carregar una exportació

1. Clica a `Carrega exportació`.
2. Selecciona _chat.txt.
3. Opcionalment, selecciona també els fitxers adjunts (imatges, vídeos, àudios, etc.) en la mateixa selecció múltiple.

Notes:

- Si no selecciones un adjunt, el missatge es mostra igualment però sense previsualització.
- Les URL dels adjunts es creen amb URL.createObjectURL i no surten del navegador.

## Scripts

```bash
npm start       # ng serve
npm run build   # build de producció
npm test        # tests unitaris
```

[![Node.js CI](https://github.com/rbuj/whatsapp-backup-viewer-angular/actions/workflows/node.yml/badge.svg)](https://github.com/rbuj/whatsapp-backup-viewer-angular/actions/workflows/node.yml)
