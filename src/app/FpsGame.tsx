"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ITEMS, MODES, type ModeDef, type Rules, type HudState, type Result } from "@/game/items";

type Difficulty = "easy" | "normal" | "hard";
type Theme = "sky" | "real" | "night";
type EngineLike = {
  start: (
    n: number,
    d: Difficulty,
    mode: "classic" | "br",
    teamSize: number,
    opts?: { flat?: boolean; rules?: Partial<Rules> },
  ) => void;
  lock: () => void;
  dispose: () => void;
  setQuality: (high: boolean) => void;
  setTheme: (t: Theme | boolean) => void;
  setThirdPerson: (on: boolean) => void;
  setPreview: (on: boolean) => void;
};

const DIFFS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "😊 Leicht" },
  { id: "normal", label: "🙂 Normal" },
  { id: "hard", label: "😈 Schwer" },
];

const medals = ["🥇", "🥈", "🥉"];

export default function FpsGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineLike | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [screen, setScreen] = useState<"menu" | "playing" | "over">("menu");
  const [result, setResult] = useState<Result | null>(null);
  const [players, setPlayers] = useState(8);
  const [ready, setReady] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [high, setHigh] = useState(true);
  const [theme, setThemeState] = useState<Theme>("sky");
  const [modeId, setModeId] = useState("classic");
  const [playedMode, setPlayedMode] = useState<ModeDef | null>(null);
  const [teamSize, setTeamSize] = useState(1);
  const [tp, setTp] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let engine: EngineLike | null = null;
    let cancelled = false;
    import("@/game/engine").then(({ Engine }) => {
      if (cancelled || !mountRef.current) return;
      engine = new Engine(mountRef.current, setHud, (r) => {
        setResult(r);
        setScreen("over");
      });
      engine.setTheme(true);
      engineRef.current = engine;
      const pv = new URLSearchParams(window.location.search).get("preview");
      if (pv) {
        engine.setPreview(true);
        setPreview(pv);
        if (pv === "night") engine.setTheme(false);
        if (pv === "real") engine.setTheme("real");
        if (pv === "play" || pv === "tp" || pv === "br" || pv === "real" || pv === "flat" || pv === "flatreal") {
          if (pv === "flatreal") engine.setTheme("real");
          engine.setThirdPerson(pv === "tp" || pv === "flat");
          const fl = pv === "flat" || pv === "flatreal";
          engine.start(fl ? 16 : 8, "easy", pv === "br" ? "br" : "classic", pv === "br" ? 2 : 1, { flat: fl });
          setScreen("playing");
        }
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const start = () => {
    engineRef.current?.setQuality(high);
    engineRef.current?.setThirdPerson(tp);
    const pick = MODES.find((m) => m.id === modeId) ?? MODES[0];
    const others = MODES.filter((m) => m.id !== "random");
    const m = pick.id === "random" ? others[Math.floor(Math.random() * others.length)] : pick;
    setPlayedMode(m);
    const n = m.players ?? players;
    const team = m.team ?? (m.map === "ring" ? Math.min(teamSize, Math.floor(n / 2) || 1) : teamSize);
    engineRef.current?.start(n, difficulty, m.storm ? "br" : "classic", team, { flat: m.map === "flat", rules: m.rules });
    engineRef.current?.lock();
    setResult(null);
    setScreen("playing");
  };

  const curMode = MODES.find((m) => m.id === modeId) ?? MODES[0];
  const playing = screen === "playing" && hud?.playing;
  const paused = playing && !hud?.locked && !hud?.dead && !preview;
  const sel = hud ? hud.slots[hud.sel] : null;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      <div ref={mountRef} className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }}
      />

      {playing && hud && !hud.dead && (
        <>
          {/* Schaden-Rand */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: hud.hurt,
              background: "radial-gradient(ellipse at center, transparent 45%, rgba(220,38,38,0.65) 100%)",
            }}
          />

          {/* Zielfernrohr oder Fadenkreuz */}
          {hud.zoom ? (
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-0"
                style={{ background: "radial-gradient(circle at center, transparent 0, transparent 32vmin, #000 32.3vmin)" }}
              />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/80" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-black/80" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
            </div>
          ) : (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="relative h-8 w-8">
                <div className="absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 bg-white shadow" />
                <div className="absolute bottom-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 bg-white shadow" />
                <div className="absolute left-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-white shadow" />
                <div className="absolute right-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-white shadow" />
                <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
              </div>
            </div>
          )}
          {hud.hit && (
            <div
              className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl font-black ${
                hud.headshot ? "text-yellow-300" : "text-white"
              }`}
            >
              ✕
            </div>
          )}
          {hud.reload > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 mt-8 h-1.5 w-16 -translate-x-1/2 overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-sky-300" style={{ width: `${(1 - hud.reload) * 100}%` }} />
            </div>
          )}

          {hud.charge > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 mt-12 h-2 w-24 -translate-x-1/2 overflow-hidden rounded-full border border-white/40 bg-black/50">
              <div
                className={`h-full ${hud.charge >= 1 ? "bg-yellow-300" : "bg-orange-500"}`}
                style={{ width: `${hud.charge * 100}%` }}
              />
            </div>
          )}

          {/* oben */}
          <div className="pointer-events-none absolute left-4 top-4 rounded-xl bg-black/50 px-4 py-2 text-lg font-black backdrop-blur">
            👥 {hud.alive} / {hud.total}
            {hud.teamSize > 1 && <span className="ml-2 text-sm">· {hud.teams} Teams</span>} <span className="ml-3">🎯 {hud.kills}</span>
            {hud.muted && <span className="ml-3">🔇</span>}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-xl bg-black/50 px-4 py-2 font-bold backdrop-blur">
            🎁 Neuer Gegenstand in {hud.nextItem}
            {hud.storm && <div className="text-center text-sm text-purple-200">{hud.storm}</div>}
          </div>
          {hud.inStorm && (
            <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 animate-pulse rounded-xl bg-purple-700/80 px-5 py-2 text-xl font-black">
              ⚠️ Du bist im Sturm! Lauf zur Mitte!
            </div>
          )}
          {hud.gliding && (
            <div className="pointer-events-none absolute bottom-40 left-1/2 -translate-x-1/2 rounded-xl bg-black/55 px-4 py-2 font-bold backdrop-blur">
              🪂 Du gleitest – lenke mit W A S D und lande auf einer Säule!
            </div>
          )}
          {hud.banner && (
            <div
              key={hud.banner}
              className="pointer-events-none absolute left-1/2 top-[28%] -translate-x-1/2 animate-bounce whitespace-nowrap text-4xl font-black text-yellow-300 drop-shadow-[0_3px_6px_rgba(0,0,0,0.9)] sm:text-5xl"
            >
              {hud.banner}
            </div>
          )}
          {hud.lava && (
            <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 animate-pulse text-4xl font-black text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {hud.theme === "real" ? "🌊 DAS MEER STEIGT! 🌊" : hud.theme === "sky" ? "☁️ DIE WOLKEN STEIGEN! ☁️" : "🔥 DIE LAVA STEIGT! 🔥"}
            </div>
          )}
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1">
            {hud.feed.map((t, i) => (
              <div key={i + t} className="rounded-lg bg-black/55 px-3 py-1 text-sm font-bold backdrop-blur">
                {t}
              </div>
            ))}
          </div>

          {hud.mates.length > 0 && (
            <div className="pointer-events-none absolute bottom-36 left-6 w-56 space-y-1.5 rounded-xl bg-black/45 p-2.5 text-xs backdrop-blur">
              {hud.mates.map((m) => (
                <div key={m.name} className={m.alive ? "" : "opacity-40"}>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                    {m.name} {!m.alive && "💀"}
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
                    <div className="h-full bg-sky-400" style={{ width: `${m.shield}%` }} />
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
                    <div className="h-full bg-green-500" style={{ width: `${m.hp}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Leben */}
          <div className="pointer-events-none absolute bottom-6 left-6 w-64">
            <div className="mb-1 flex items-center justify-between text-sm font-black text-sky-300">
              <span>🛡️ SCHILD</span>
              <span>{hud.shield}</span>
            </div>
            <div className="mb-2 h-3 overflow-hidden rounded-full border-2 border-white/30 bg-black/60">
              <div className="h-full bg-sky-400 transition-all" style={{ width: `${hud.shield}%` }} />
            </div>
            <div className="mb-1 flex items-center justify-between text-sm font-black">
              <span>❤️ LEBEN</span>
              <span>{hud.hp}</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full border-2 border-white/30 bg-black/60">
              <div
                className={`h-full transition-all ${hud.hp > 50 ? "bg-green-500" : hud.hp > 25 ? "bg-yellow-400" : "bg-red-500"}`}
                style={{ width: `${hud.hp}%` }}
              />
            </div>
          </div>

          {/* Inventar */}
          <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
            {sel && (
              <div className="rounded-lg bg-black/55 px-3 py-1 text-sm backdrop-blur">
                <b>{ITEMS[sel.kind].name}</b> · {ITEMS[sel.kind].info}
              </div>
            )}
            <div className="flex gap-2">
              {hud.slots.map((s, i) => (
                <div
                  key={i}
                  className={`relative flex h-16 w-16 items-center justify-center rounded-xl border-2 text-3xl backdrop-blur ${
                    i === hud.sel ? "scale-110 border-yellow-300 bg-yellow-300/25" : "border-white/25 bg-black/50"
                  }`}
                >
                  <span className="absolute left-1 top-0.5 text-[10px] font-bold opacity-70">{i + 1}</span>
                  {s && ITEMS[s.kind].emoji}
                  {s && ITEMS[s.kind].uses > 1 && (
                    <span className="absolute bottom-0.5 right-1 text-xs font-black">{s.uses}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Zuschauen */}
      {playing && hud?.dead && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center">
          <div className="flex items-center gap-4 rounded-2xl bg-black/70 px-6 py-4 backdrop-blur">
            <span className="text-lg font-bold">💥 Du bist raus! Platz {hud.place} · Du schaust zu …</span>
            <button onClick={start} className="rounded-full bg-orange-500 px-5 py-2 font-black hover:bg-orange-400">
              NOCHMAL 🔁
            </button>
          </div>
        </div>
      )}

      {/* Pause */}
      {paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
          <h2 className="text-5xl font-black">⏸ Pause</h2>
          <button
            onClick={() => engineRef.current?.lock()}
            className="rounded-full bg-orange-500 px-10 py-4 text-2xl font-black hover:bg-orange-400"
          >
            WEITERSPIELEN ▶
          </button>
        </div>
      )}

      {/* Menü und Ergebnis */}
      {screen !== "playing" && !preview && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-sky-950/40 via-black/30 to-black/60 text-center">
          <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4">
            {screen === "menu" ? (
              <>
                <h1 className="bg-gradient-to-b from-yellow-200 to-orange-500 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] sm:text-7xl">
                  THE PILERS
                </h1>
                <p className="font-bold text-white drop-shadow">3D · Säulen-Kampf · Wer runterfällt, ist raus!</p>
              </>
            ) : (
              <>
                {playedMode && (
                  <p className="font-bold text-orange-200">
                    {playedMode.emoji} {playedMode.name}
                  </p>
                )}
                <h1 className="text-4xl font-black drop-shadow sm:text-6xl">
                  {result?.won ? "🏆 DU HAST GEWONNEN!" : `Platz ${result?.place}`}
                </h1>
                <ol className="grid grid-cols-2 gap-x-8 gap-y-1 rounded-2xl bg-black/40 px-6 py-3 text-left text-base">
                  {result?.ranking.filter((r, i) => i < 10 || r.you).map((r) => (
                    <li key={r.name} className={`flex items-center gap-2 ${r.you ? "font-black text-yellow-300" : ""}`}>
                      <span className="w-7 text-right">{medals[r.place - 1] ?? `${r.place}.`}</span>
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: r.color }} />
                      {r.name}
                      <span className="ml-auto pl-3 text-sm opacity-80">🎯 {r.kills}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <button
              onClick={start}
              disabled={!ready}
              className="rounded-full bg-gradient-to-b from-orange-400 to-orange-600 px-14 py-4 text-3xl font-black shadow-[0_6px_0_#9a3412,0_10px_30px_rgba(0,0,0,0.4)] transition hover:scale-105 active:translate-y-1 disabled:opacity-50"
            >
              {!ready ? "Lädt …" : screen === "menu" ? "SPIELEN ▶" : "NOCHMAL 🔁"}
            </button>

            {screen === "menu" && (
              <div className="w-full max-w-5xl rounded-2xl bg-black/45 p-3 backdrop-blur">
                <div className="mb-2 text-left text-sm font-bold">🎮 Spielmodus ({MODES.length})</div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModeId(m.id)}
                      className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-xs font-bold transition ${
                        modeId === m.id ? "bg-orange-500 ring-2 ring-yellow-300" : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      <span className="text-lg">{m.emoji}</span>
                      <span className="leading-tight">{m.name}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-left text-sm text-orange-100">
                  {curMode.emoji} <b>{curMode.name}:</b> {curMode.desc}
                </p>
              </div>
            )}
            <div className="grid w-full max-w-2xl grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-2xl bg-black/45 p-4 text-left backdrop-blur">
              {!curMode.team && (
              <Row label="Team">
                {[
                  { v: 1, label: "👤 Solo" },
                  { v: 2, label: "👥 Duo" },
                  { v: 3, label: "👨‍👩‍👦 Trio" },
                ].map((q) => (
                  <Pill key={q.v} on={teamSize === q.v} onClick={() => setTeamSize(q.v)}>
                    {q.label}
                  </Pill>
                ))}
              </Row>
              )}
              {curMode.map === "ring" && !curMode.players && (
                <Row label="Spieler">
                  {[4, 6, 8].map((n) => (
                    <Pill key={n} on={players === n} onClick={() => setPlayers(n)}>
                      {n}
                    </Pill>
                  ))}
                </Row>
              )}
              <Row label="Schwierigkeit">
                {DIFFS.map((d) => (
                  <Pill key={d.id} on={difficulty === d.id} onClick={() => setDifficulty(d.id)}>
                    {d.label}
                  </Pill>
                ))}
              </Row>
              <Row label="Welt">
                {(
                  [
                    { v: "sky", label: "☀️ Himmel" },
                    { v: "real", label: "🌄 Realistisch" },
                    { v: "night", label: "🌋 Lava-Nacht" },
                  ] as const
                ).map((q) => (
                  <Pill
                    key={q.v}
                    on={theme === q.v}
                    onClick={() => {
                      setThemeState(q.v);
                      engineRef.current?.setTheme(q.v);
                    }}
                  >
                    {q.label}
                  </Pill>
                ))}
              </Row>
              <Row label="Kamera">
                {[
                  { v: false, label: "👀 Ich-Sicht" },
                  { v: true, label: "🧍 Schulter" },
                ].map((q) => (
                  <Pill
                    key={q.label}
                    on={tp === q.v}
                    onClick={() => {
                      setTp(q.v);
                      engineRef.current?.setThirdPerson(q.v);
                    }}
                  >
                    {q.label}
                  </Pill>
                ))}
              </Row>
              <Row label="Grafik">
                {[
                  { v: true, label: "✨ Schön" },
                  { v: false, label: "⚡ Schnell" },
                ].map((q) => (
                  <Pill
                    key={q.label}
                    on={high === q.v}
                    onClick={() => {
                      setHigh(q.v);
                      engineRef.current?.setQuality(q.v);
                    }}
                  >
                    {q.label}
                  </Pill>
                ))}
              </Row>
            </div>

            <p className="max-w-2xl rounded-xl bg-black/35 px-4 py-2 text-xs leading-relaxed sm:text-sm">
              🖱️ Maus = umschauen · <b>W A S D</b> = laufen · <b>Leertaste</b> = springen · <b>Linksklick</b> = schießen ·{" "}
              <b>Rechtsklick</b> = Zielfernrohr · <b>1–5</b> = Gegenstand · <b>V</b> = Kamera · <b>B</b> = Tanzen 💃 · <b>M</b> = Ton aus/an · <b>Esc</b> = Pause
            </p>
            <Link href="/2d" className="text-xs underline opacity-70 hover:opacity-100">
              Alte 2D-Version spielen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-sm font-bold">{label}:</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${on ? "bg-orange-500" : "bg-white/15 hover:bg-white/25"}`}
    >
      {children}
    </button>
  );
}
