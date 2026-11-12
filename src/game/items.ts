// Gegenstände und gemeinsame Typen (ohne Three.js, damit die Oberfläche sie benutzen kann)

export type ItemKind =
  | "rifle"
  | "sniper"
  | "shotgun"
  | "smg"
  | "minigun"
  | "rocket"
  | "bow"
  | "raygun"
  | "apple"
  | "bandage"
  | "medkit"
  | "fish"
  | "pizza"
  | "icecream"
  | "shieldpotion"
  | "minishield"
  | "bridge"
  | "mushroom"
  | "bomb";

export const ITEMS: Record<ItemKind, { name: string; emoji: string; uses: number; weight: number; info: string }> = {
  rifle: { name: "Luftgewehr", emoji: "🔫", uses: 30, weight: 1.3, info: "Maustaste gedrückt halten" },
  sniper: { name: "Sniper", emoji: "🎯", uses: 4, weight: 0.9, info: "Rechtsklick = Zielfernrohr" },
  shotgun: { name: "Schrotflinte", emoji: "💥", uses: 8, weight: 1.1, info: "Ganz nah = riesiger Schaden" },
  smg: { name: "Maschinenpistole", emoji: "💨", uses: 40, weight: 1.1, info: "Superschnell, aber schwach" },
  minigun: { name: "Minigun", emoji: "🌀", uses: 90, weight: 0.6, info: "Halten: dreht hoch, dann Dauerfeuer" },
  rocket: { name: "Raketenwerfer", emoji: "🚀", uses: 3, weight: 0.6, info: "Explodiert und zerstört Brücken" },
  bow: { name: "Bogen", emoji: "🏹", uses: 8, weight: 0.9, info: "Halten = spannen, loslassen = schießen" },
  raygun: { name: "Strahlen-Pistole", emoji: "🔵", uses: 20, weight: 0.9, info: "Leuchtende Laserkugeln" },
  apple: { name: "Apfel", emoji: "🍎", uses: 3, weight: 0.8, info: "+15 Leben" },
  bandage: { name: "Verband", emoji: "🩹", uses: 3, weight: 0.8, info: "+20 Leben (bis 75)" },
  medkit: { name: "Medi-Kit", emoji: "🧰", uses: 1, weight: 0.9, info: "+50 Leben" },
  fish: { name: "Heil-Fisch", emoji: "🐟", uses: 1, weight: 0.6, info: "+30 Leben, Rest wird Schild" },
  pizza: { name: "Pizza", emoji: "🍕", uses: 2, weight: 0.5, info: "+60 Leben langsam" },
  icecream: { name: "Eis", emoji: "🍦", uses: 1, weight: 0.5, info: "+25 Leben und +25 Schild" },
  shieldpotion: { name: "Schild-Trank", emoji: "🧪", uses: 1, weight: 0.6, info: "+50 Schild" },
  minishield: { name: "Mini-Schild", emoji: "💧", uses: 3, weight: 0.8, info: "+25 Schild (bis 50)" },
  bridge: { name: "Brücke", emoji: "🌉", uses: 1, weight: 1.3, info: "Hoch/runter schauen = Rampe" },
  mushroom: { name: "Sprung-Pilz", emoji: "🍄", uses: 1, weight: 0.9, info: "Klick = Riesensprung" },
  bomb: { name: "Bombe", emoji: "💣", uses: 2, weight: 0.7, info: "Klick = werfen" },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export type Slot = { kind: ItemKind; uses: number };

export type HudState = {
  playing: boolean;
  locked: boolean;
  dead: boolean;
  place: number;
  hp: number;
  shield: number;
  day: boolean;
  theme: "sky" | "real" | "night";
  mode: "classic" | "br";
  teams: number;
  teamSize: number;
  mates: { name: string; color: string; hp: number; shield: number; alive: boolean }[];
  storm: string;
  inStorm: boolean;
  gliding: boolean;
  kills: number;
  banner: string;
  muted: boolean;
  slots: (Slot | null)[];
  sel: number;
  nextItem: number;
  alive: number;
  total: number;
  zoom: boolean;
  hit: boolean;
  headshot: boolean;
  hurt: number;
  reload: number;
  charge: number;
  lava: boolean;
  feed: string[];
};

export type Ranking = { name: string; color: string; place: number; you: boolean; kills: number }[];
export type Result = { won: boolean; place: number; ranking: Ranking };

// ---------- Spielregeln und die 30 Spielmodi ----------
export type Rules = {
  items: ItemKind[] | null; // welche Zufalls-Gegenstände es gibt (null = alle)
  start: ItemKind[]; // was jeder am Anfang hat
  itemEvery: number; // Sekunden bis zum nächsten Gegenstand
  gravity: number;
  speed: number;
  jump: number;
  dmg: number; // Schaden-Faktor
  kb: number; // Rückstoß-Faktor
  youDmg: number; // Schaden, den DU bekommst
  lava: boolean; // steigt die Lava?
  lavaStart: number | null;
  lavaSpeed: number;
  noHeal: boolean;
  vampire: boolean; // Treffer heilen dich
  regen: boolean; // Leben kommt langsam zurück
  infinite: boolean; // unendlich Munition
  chestEvery: number | null;
  fog: number | null;
  youBias: number | null; // < 1: alle Gegner jagen dich
};

export const DEFAULT_RULES: Rules = {
  items: null,
  start: ["rifle"],
  itemEvery: 5,
  gravity: 1,
  speed: 1,
  jump: 1,
  dmg: 1,
  kb: 1,
  youDmg: 1,
  lava: true,
  lavaStart: null,
  lavaSpeed: 1,
  noHeal: false,
  vampire: false,
  regen: false,
  infinite: false,
  chestEvery: null,
  fog: null,
  youBias: null,
};

export type MapKind = "ring" | "br" | "flat";
export type ModeDef = {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  map: MapKind;
  storm?: boolean;
  players?: number;
  team?: number;
  rules?: Partial<Rules>;
};

const HEAL_KINDS: ItemKind[] = ["apple", "bandage", "medkit", "fish", "pizza", "icecream", "shieldpotion", "minishield"];

export const MODES: ModeDef[] = [
  { id: "classic", emoji: "🏛️", name: "Klassisch", desc: "Säulen im Kreis, Zufalls-Gegenstände, die Lava steigt.", map: "ring" },
  { id: "br", emoji: "🪂", name: "Battle Royale", desc: "100 Spieler auf der riesigen flachen Karte. Der Sturm wird kleiner!", map: "flat", storm: true, players: 100 },
  { id: "forest-br", emoji: "🏎️", name: "Turbo-Royale", desc: "Battle Royale mit 100 Spielern – aber superschnell und alle 2 Sekunden ein Gegenstand!", map: "flat", storm: true, players: 100, rules: { speed: 1.4, itemEvery: 2 } },
  { id: "forest", emoji: "🏕️", name: "Waldkampf", desc: "Riesige flache Karte mit Wald, Flüssen, Hütten und Türmen. 24 Spieler.", map: "flat", players: 24 },
  { id: "duo-br", emoji: "👥", name: "Duo-Royale", desc: "Battle Royale zu zweit auf der flachen Karte – 50 Teams.", map: "flat", storm: true, players: 100, team: 2 },
  { id: "trio-br", emoji: "👨‍👩‍👦", name: "Trio-Royale", desc: "Battle Royale zu dritt im Wald.", map: "flat", storm: true, players: 99, team: 3 },
  { id: "teams", emoji: "⚔️", name: "Team-Kampf 4 gegen 4", desc: "Zwei Teams mit je 4 Spielern.", map: "ring", players: 8, team: 4 },
  { id: "1v1", emoji: "🆚", name: "1 gegen 1", desc: "Nur du und ein Gegner.", map: "ring", players: 2, team: 1 },
  { id: "sniper", emoji: "🎯", name: "Nur Sniper", desc: "Alle haben Sniper. Kopftreffer!", map: "ring", rules: { start: ["sniper"], items: ["sniper", "medkit", "shieldpotion", "bridge"] } },
  { id: "shotgun", emoji: "💥", name: "Schrot-Chaos", desc: "Nur Schrotflinten – geh nah ran!", map: "ring", rules: { start: ["shotgun", "bridge"], items: ["shotgun", "bridge", "mushroom", "bandage"] } },
  { id: "rocket", emoji: "🚀", name: "Raketen-Party", desc: "Raketenwerfer mit unendlich Munition.", map: "ring", rules: { start: ["rocket"], items: ["rocket", "minishield"], infinite: true } },
  { id: "bow", emoji: "🏹", name: "Bogen-Duell", desc: "Nur Bögen. Spannen, zielen, treffen!", map: "ring", players: 4, rules: { start: ["bow"], items: ["bow", "apple", "bridge"] } },
  { id: "laser", emoji: "🔵", name: "Laser-Show", desc: "Alle schießen mit Strahlen-Pistolen.", map: "ring", rules: { start: ["raygun"], items: ["raygun", "minishield", "mushroom"], infinite: true } },
  { id: "minigun", emoji: "🌀", name: "Minigun-Mania", desc: "Jeder hat eine Minigun. Laut!", map: "ring", rules: { start: ["minigun"], items: ["minigun", "shieldpotion"], infinite: true } },
  { id: "moon", emoji: "🌙", name: "Mondsprung", desc: "Kaum Schwerkraft – riesige Sprünge!", map: "ring", rules: { gravity: 0.35, jump: 1.3 } },
  { id: "turbo", emoji: "⚡", name: "Turbo", desc: "Alles doppelt so schnell, Gegenstände alle 2 Sekunden.", map: "ring", rules: { speed: 1.7, itemEvery: 2, lavaSpeed: 2 } },
  { id: "oneshot", emoji: "💀", name: "Ein Treffer", desc: "Jeder Treffer haut sofort raus.", map: "ring", rules: { dmg: 12, start: ["rifle", "sniper"], noHeal: true } },
  { id: "vampire", emoji: "🧛", name: "Vampir", desc: "Wer trifft, bekommt Leben zurück.", map: "ring", rules: { vampire: true, noHeal: true } },
  { id: "noheal", emoji: "🚫", name: "Kein Heilen", desc: "Es gibt keine Heil-Sachen. Pass gut auf!", map: "ring", rules: { noHeal: true } },
  { id: "bounce", emoji: "🍄", name: "Hüpfburg", desc: "Riesiger Rückstoß, Sprung-Pilze überall.", map: "ring", rules: { kb: 3, dmg: 0.4, items: ["mushroom", "bomb", "rifle", "bridge"] } },
  { id: "bombs", emoji: "💣", name: "Bomben-Regen", desc: "Nur Bomben – und davon unendlich!", map: "ring", rules: { start: ["bomb"], items: ["bomb", "minishield"], infinite: true } },
  { id: "builder", emoji: "🌉", name: "Brückenbauer", desc: "Ständig neue Brücken und Pilze.", map: "ring", rules: { itemEvery: 2, items: ["bridge", "mushroom", "rifle", "apple"] } },
  { id: "fastlava", emoji: "🔥", name: "Schnelle Lava", desc: "Die Lava steigt schon nach 10 Sekunden – und schnell!", map: "ring", rules: { lavaStart: 10, lavaSpeed: 2.2 } },
  { id: "treasure", emoji: "📦", name: "Schatzjagd", desc: "Alle 6 Sekunden fällt eine Schatzkiste.", map: "ring", rules: { chestEvery: 6 } },
  { id: "gifts", emoji: "🎁", name: "Geschenke-Flut", desc: "Jede Sekunde ein neuer Gegenstand.", map: "ring", rules: { itemEvery: 1 } },
  { id: "push", emoji: "👊", name: "Schubs-Party", desc: "Kaum Schaden, aber mega Rückstoß. Schubs alle in die Lava!", map: "ring", rules: { dmg: 0.15, kb: 4, items: ["rifle", "shotgun", "bomb", "mushroom", "bridge"] } },
  { id: "boss", emoji: "👑", name: "Alle gegen dich", desc: "Alle Gegner jagen nur dich – aber du bist super stark.", map: "ring", rules: { youDmg: 0.3, youBias: 0.15, regen: true } },
  { id: "fog", emoji: "🌫️", name: "Nebel", desc: "Dichter Nebel – man sieht kaum etwas.", map: "flat", players: 24, rules: { fog: 0.035 } },
  { id: "infinite", emoji: "♾️", name: "Unendlich", desc: "Unendlich Munition und Leben kommt zurück.", map: "ring", rules: { infinite: true, regen: true } },
  { id: "random", emoji: "🎲", name: "Zufall", desc: "Jede Runde ein zufälliger Modus!", map: "ring" },
];
export { HEAL_KINDS };
