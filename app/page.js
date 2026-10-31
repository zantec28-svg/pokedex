"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const sprite = (f) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${f}.png`;
const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

const CATS = [
  ["regional", "Formes régionales"],
  ["other", "Autres formes"],
  ["zarbi", "Zarbi"],
];
const LABELS = {
  alola: "Alola", galar: "Galar", hisui: "Hisui", paldea: "Paldea",
  mega: "Méga", "mega-x": "Méga X", "mega-y": "Méga Y", gmax: "Gigamax",
  primal: "Primo", eternamax: "Éternamax",
};
// Formes ignorées : Totems, casquettes / cosplay de Pikachu, Pikachu et Évoli de départ
const SKIP = /totem|cosplay|(^|-)cap$|starter|rock-star|belle|pop-star|phd|libre/;

function classify(suffix) {
  if (/^(alola|galar|hisui|paldea)/.test(suffix)) return "regional";
  if (/^(mega|primal|eternamax)|gmax$/.test(suffix)) return null; // Méga, Primo, Gigamax : non suivis
  return "other";
}

const genOf = (id) => [151, 251, 386, 493, 649, 721, 809, 905, 1025].findIndex((m) => id <= m) + 1 || 10;

const QUERY = `{
  species: pokemon_v2_pokemonspecies(order_by: {id: asc}) {
    id name generation_id
    names: pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: 5}}) { name }
    varieties: pokemon_v2_pokemons(where: {is_default: {_eq: false}}, order_by: {id: asc}) { id name }
  }
}`;

function build(species) {
  const list = [];
  for (const s of species) {
    const fr = s.names[0]?.name || s.name;
    const base = { sid: s.id, gen: s.generation_id };
    list.push({ ...base, key: String(s.id), name: fr, cat: "base", img: String(s.id) });
    for (const v of s.varieties) {
      const suffix = v.name.slice(s.name.length + 1);
      if (!suffix || SKIP.test(suffix)) continue;
      const cat = classify(suffix);
      if (!cat) continue;
      list.push({
        ...base, key: "v" + v.id, img: String(v.id), cat,
        name: `${fr} (${LABELS[suffix] || suffix.replace(/-/g, " ")})`,
      });
    }
    if (s.id === 201) {
      for (const c of [..."abcdefghijklmnopqrstuvwxyz", "exclamation", "question"]) {
        const sym = c === "exclamation" ? "!" : c === "question" ? "?" : c.toUpperCase();
        list.push({ ...base, key: "u-" + c, name: `Zarbi ${sym}`, cat: "zarbi", img: c === "a" ? "201" : `201-${c}` });
      }
    }
  }
  return list;
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [owned, setOwned] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [cats, setCats] = useState(new Set(CATS.map((c) => c[0])));
  const [genFilter, setGenFilter] = useState(0);
  const [q, setQ] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  async function api(method, body) {
    const r = await fetch("/api/owned", {
      method,
      headers: { "content-type": "application/json", "x-pin": localStorage.getItem("pin") || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { setCanEdit(false); throw new Error("pin"); }
    if (!r.ok) throw new Error("api");
    return r.json();
  }

  async function load() {
    try {
      const data = await api("GET");
      setCanEdit(data.canEdit);
      setOwned(new Set(data.ids));
      return data.canEdit;
    } catch (e) {
      if (e.message !== "pin") setMsg("Impossible de charger la collection.");
      return false;
    }
  }

  async function unlock() {
    localStorage.setItem("pin", pinInput);
    const ok = await load();
    if (ok) { setShowPin(false); setMsg(""); }
    else { localStorage.removeItem("pin"); setMsg("Code incorrect."); }
    setPinInput("");
  }

  function lock() {
    localStorage.removeItem("pin");
    setCanEdit(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const g = await fetch("https://beta.pokeapi.co/graphql/v1beta", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: QUERY }),
        }).then((r) => r.json());
        setEntries(build(g.data.species));
      } catch {
        try {
          const d = await fetch("https://pokeapi.co/api/v2/pokemon-species?limit=2000").then((r) => r.json());
          setEntries(
            d.results
              .map((s) => ({ sid: Number(s.url.match(/(\d+)\/$/)[1]), name: s.name }))
              .sort((a, b) => a.sid - b.sid)
              .map((s) => ({ ...s, key: String(s.sid), cat: "base", gen: genOf(s.sid), img: String(s.sid) }))
          );
          setMsg("Noms français et formes indisponibles pour le moment.");
        } catch {
          setMsg("Liste des Pokémon indisponible (PokéAPI).");
        }
      }
    })();
    load();
  }, []);

  async function toggle(key) {
    if (!canEdit) return;
    const has = owned.has(key);
    const next = new Set(owned);
    has ? next.delete(key) : next.add(key);
    setOwned(next);
    try {
      await api("POST", { ids: [key], owned: !has });
    } catch {
      setOwned(owned);
      setMsg("Échec de l'enregistrement, réessaie.");
    }
  }

  async function importCsv(file) {
    const text = await file.text();
    const ids = text.split(/\r?\n/).map((l) => parseInt(l.split(/[;,\t]/)[0], 10)).filter((n) => n > 0).map(String);
    if (!ids.length) return setMsg("Aucun numéro trouvé dans la première colonne.");
    try {
      await api("POST", { ids, owned: true });
      await load();
      setMsg(`${ids.length} numéros importés.`);
    } catch {
      setMsg("Import impossible.");
    }
  }

  function toggleCat(c) {
    const n = new Set(cats);
    n.has(c) ? n.delete(c) : n.add(c);
    setCats(n);
  }

  const { sections, baseGot, baseTotal, formGot, formTotal } = useMemo(() => {
    const s = norm(q.trim());
    const map = new Map();
    let baseGot = 0, baseTotal = 0, formGot = 0, formTotal = 0;
    for (const e of entries) {
      const has = owned.has(e.key);
      if (e.cat === "base") { baseTotal++; if (has) baseGot++; }
      else if (cats.has(e.cat)) { formTotal++; if (has) formGot++; }
      else continue;
      const g = map.get(e.gen) || { gen: e.gen, all: 0, got: 0, items: [] };
      g.all++;
      if (has) g.got++;
      if ((!genFilter || e.gen === genFilter) && (filter === "all" || (filter === "owned") === has) && (!s || norm(e.name).includes(s) || String(e.sid) === s)) g.items.push(e);
      map.set(e.gen, g);
    }
    const sections = [...map.values()].filter((g) => g.items.length).sort((a, b) => a.gen - b.gen);
    return { sections, baseGot, baseTotal, formGot, formTotal };
  }, [entries, owned, filter, cats, genFilter, q]);

  const gens = useMemo(() => [...new Set(entries.map((e) => e.gen))].sort((a, b) => a - b), [entries]);

  const pct = baseTotal ? Math.round((baseGot / baseTotal) * 100) : 0;

  return (
    <main>
      <header>
        <div className="top">
          <h1>Pokédex en cartes</h1>
          <p className="count">
            <strong>{baseGot}</strong> / {baseTotal || "…"} Pokémon · {pct} %
            {formTotal > 0 && <> · formes <strong>{formGot}</strong> / {formTotal}</>}
          </p>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="tools">
          <input type="search" placeholder="Nom ou numéro" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
          {[["all", "Tous"], ["owned", "Obtenus"], ["missing", "Manquants"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
          {canEdit ? (
            <>
              <button onClick={() => fileRef.current.click()}>Importer un CSV</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
              <button onClick={lock}>Verrouiller</button>
            </>
          ) : (
            <button onClick={() => setShowPin(!showPin)}>Modifier</button>
          )}
        </div>
        <div className="tools chips" role="group" aria-label="Formes à afficher">
          {CATS.map(([k, l]) => (
            <button key={k} aria-pressed={cats.has(k)} className={cats.has(k) ? "on" : ""} onClick={() => toggleCat(k)}>{l}</button>
          ))}
        </div>
        {gens.length > 1 && (
          <div className="tools chips" role="group" aria-label="Génération">
            <button className={!genFilter ? "on" : ""} aria-pressed={!genFilter} onClick={() => setGenFilter(0)}>Toutes les générations</button>
            {gens.map((g) => (
              <button key={g} className={genFilter === g ? "on" : ""} aria-pressed={genFilter === g} onClick={() => setGenFilter(g)}>
                Gén. {ROMAN[g] || g}
              </button>
            ))}
          </div>
        )}
        {showPin && !canEdit && (
          <div className="tools chips">
            <input
              type="password"
              placeholder="Code d'accès"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
              aria-label="Code d'accès"
              autoFocus
            />
            <button onClick={unlock}>Valider</button>
          </div>
        )}
        {msg && <p className="msg" onClick={() => setMsg("")}>{msg}</p>}
      </header>

      {sections.map((g) => (
        <section key={g.gen}>
          <h2>
            Génération {ROMAN[g.gen] || g.gen} <span>{g.got} / {g.all}</span>
          </h2>
          <ul className="grid">
            {g.items.map((e) => (
              <li key={e.key}>
                <button className={owned.has(e.key) ? "card has" : "card"} disabled={!canEdit} aria-pressed={owned.has(e.key)} onClick={() => toggle(e.key)}>
                  <img src={sprite(e.img)} alt="" loading="lazy" width="96" height="96" onError={(ev) => (ev.currentTarget.style.visibility = "hidden")} />
                  <span className="num">{String(e.sid).padStart(4, "0")}</span>
                  <span className="name">{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
