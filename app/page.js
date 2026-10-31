"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const sprite = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

export default function Page() {
  const [mons, setMons] = useState([]);
  const [owned, setOwned] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [locked, setLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  async function api(method, body) {
    const r = await fetch("/api/owned", {
      method,
      headers: { "content-type": "application/json", "x-pin": localStorage.getItem("pin") || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { setLocked(true); throw new Error("pin"); }
    if (!r.ok) throw new Error("api");
    return r.json();
  }

  async function load() {
    try {
      const data = await api("GET");
      setLocked(false);
      setOwned(new Set(data.ids));
    } catch (e) {
      if (e.message !== "pin") setMsg("Impossible de charger la collection.");
    }
  }

  useEffect(() => {
    fetch("https://pokeapi.co/api/v2/pokemon-species?limit=2000")
      .then((r) => r.json())
      .then((d) =>
        setMons(
          d.results
            .map((s) => ({ id: Number(s.url.match(/(\d+)\/$/)[1]), name: s.name }))
            .sort((a, b) => a.id - b.id)
        )
      )
      .catch(() => setMsg("Liste des Pokémon indisponible (PokéAPI)."));
    load();
  }, []);

  async function toggle(id) {
    const has = owned.has(id);
    const next = new Set(owned);
    has ? next.delete(id) : next.add(id);
    setOwned(next);
    try {
      await api("POST", { ids: [id], owned: !has });
    } catch {
      setOwned(owned);
      setMsg("Échec de l'enregistrement, réessaie.");
    }
  }

  async function importCsv(file) {
    const text = await file.text();
    const ids = text.split(/\r?\n/).map((l) => parseInt(l.split(/[;,\t]/)[0], 10)).filter((n) => n > 0);
    if (!ids.length) return setMsg("Aucun numéro trouvé dans la première colonne.");
    try {
      await api("POST", { ids, owned: true });
      await load();
      setMsg(`${ids.length} numéros importés.`);
    } catch {
      setMsg("Import impossible.");
    }
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return mons.filter(
      (m) =>
        (filter === "all" || (filter === "owned") === owned.has(m.id)) &&
        (!s || m.name.includes(s) || String(m.id) === s)
    );
  }, [mons, owned, filter, q]);

  const total = mons.length;
  const pct = total ? Math.round((owned.size / total) * 100) : 0;

  if (locked) {
    return (
      <main className="lock">
        <h1>Code d'accès</h1>
        <input
          type="password"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          aria-label="Code d'accès"
        />
        <button
          onClick={() => { localStorage.setItem("pin", pinInput); load(); }}
        >
          Entrer
        </button>
      </main>
    );
  }

  return (
    <main>
      <header>
        <div className="top">
          <h1>Pokédex en cartes</h1>
          <p className="count">
            <strong>{owned.size}</strong> / {total || "…"} cartes · {pct} %
          </p>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="tools">
          <input
            type="search"
            placeholder="Nom ou numéro"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher"
          />
          {[["all", "Tous"], ["owned", "Obtenus"], ["missing", "Manquants"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
          <button onClick={() => fileRef.current.click()}>Importer un CSV</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])}
          />
        </div>
        {msg && <p className="msg" onClick={() => setMsg("")}>{msg}</p>}
      </header>

      <ul className="grid">
        {shown.map((m) => (
          <li key={m.id}>
            <button
              className={owned.has(m.id) ? "card has" : "card"}
              aria-pressed={owned.has(m.id)}
              onClick={() => toggle(m.id)}
            >
              <img src={sprite(m.id)} alt="" loading="lazy" width="96" height="96" />
              <span className="num">{String(m.id).padStart(4, "0")}</span>
              <span className="name">{m.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
