# 🗼 The Pilers

Ein 3D-Säulen-Kampfspiel im Browser – gebaut mit [Next.js](https://nextjs.org) und [Three.js](https://threejs.org).

Du stehst auf einer Säule über der Lava (oder den Wolken, oder dem Meer). Alle paar Sekunden bekommst du einen Zufalls-Gegenstand. Triff die anderen, schubs sie runter, baue Brücken – wer als Letzter übrig ist, gewinnt!

## Features

- **30 Spielmodi** – Klassisch, Battle Royale mit 100 Spielern, Duo/Trio, Nur Sniper, Mondsprung, Vampir, Schubs-Party, Zufall und mehr
- **Battle Royale** auf einer riesigen flachen Karte mit Wäldern, Flüssen, Hütten, Türmen und Sprungpads – mit Fallschirm-Absprung, schrumpfendem Sturm und Minikarte
- **8 Waffen:** Luftgewehr, Sniper, Schrotflinte, Maschinenpistole, Minigun, Raketenwerfer, Bogen, Strahlen-Pistole
- **Heilen & Schild:** Apfel, Verband, Medi-Kit, Heil-Fisch, Pizza, Eis, Schild-Trank, Mini-Schild
- **3 Welten:** ☀️ Himmel, 🌄 Realistisch, 🌋 Lava-Nacht
- Ich-Sicht oder Schulterkamera, Sounds, Konfetti, Schatzkisten, Tanzen
- Computer-Gegner in 3 Schwierigkeitsstufen

## Steuerung

| Taste | Aktion |
|---|---|
| Maus | umschauen |
| W A S D | laufen |
| Leertaste | springen |
| Linksklick | schießen / benutzen |
| Rechtsklick | Zielfernrohr (Sniper) |
| 1–5 / Mausrad | Gegenstand wählen |
| V | Kamera wechseln |
| B | tanzen |
| M | Ton aus/an |
| Esc | Pause |

## Starten

```bash
npm install
npm run dev
```

Dann [http://localhost:3000](http://localhost:3000) im Browser öffnen. Die alte 2D-Version gibt es unter `/2d`.

## Aufbau

- `src/game/engine.ts` – die 3D-Spiel-Engine (Welt, Physik, Gegner, Waffen, Effekte)
- `src/game/items.ts` – Gegenstände, Spielregeln und die 30 Spielmodi
- `src/game/sfx.ts` – Soundeffekte (werden im Browser erzeugt)
- `src/app/FpsGame.tsx` – Menü und Anzeige im Spiel
- `src/app/PillarGame.tsx` – die alte 2D-Version
