import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://v3.football.api-sports.io";

/**
 * Logger simple
 */
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Vérification clé API (SANS CRASH)
 */
if (!API_KEY) {
  log("⚠️ API_FOOTBALL_KEY manquante (le serveur reste en vie)");
}

/**
 * Appel API-Football sécurisé
 */
async function apiFootball(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        "x-apisports-key": API_KEY
      },
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API-Football ${res.status}: ${text}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Healthcheck Railway (CRUCIAL)
 */
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "api-football-proxy",
    uptime: process.uptime()
  });
});

/**
 * Fixtures
 * /fixtures?date=YYYY-MM-DD&league=ID&season=YYYY
 */
app.get("/fixtures", async (req, res) => {
  try {
    const { date, league, season, team } = req.query;

    // 🔒 Sécurité anti ResponseTooLargeError
    if (date && !league && !team) {
      return res.status(400).json({
        error: "Requête trop large. Précise league ou team."
      });
    }

    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (league) params.append("league", league);
    if (season) params.append("season", season);
    if (team) params.append("team", team);

    const data = await apiFootball(`/fixtures?${params.toString()}`);
    res.json(data);

  } catch (err) {
    res.status(502).json({ error: "Erreur API-Football" });
  }
});

/**
 * Fixtures COMPACTES (spécial GPT)
 * /fixtures/compact?date=YYYY-MM-DD&league=ID&season=YYYY
 */
app.get("/fixtures/compact", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: "API_FOOTBALL_KEY manquante" });
    }

    const { date, league, season, team } = req.query;

    // 🔒 Obligation de restriction
    if (!league && !team) {
      return res.status(400).json({
        error: "league ou team requis pour une réponse compacte"
      });
    }

    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (league) params.append("league", league);
    if (season) params.append("season", season);
    if (team) params.append("team", team);

    const raw = await apiFootball(`/fixtures?${params.toString()}`);

    // 🧠 NORMALISATION COMPACTE
    const compact = raw.response.map(f => ({
      fixture_id: f.fixture.id,
      date: f.fixture.date,
      timestamp: f.fixture.timestamp,
      league_id: f.league.id,
      league_name: f.league.name,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_team_id: f.teams.home.id,
      away_team_id: f.teams.away.id,
      venue: f.fixture.venue?.name || null,
      status: f.fixture.status.short
    }));

    res.json({
      count: compact.length,
      fixtures: compact
    });

  } catch (err) {
    console.error("❌ /fixtures/compact", err.message);
    res.status(502).json({ error: "Erreur API-Football (compact)" });
  }
});


/**
 * Standings
 */
app.get("/standings", async (req, res) => {
  try {
    const { league, season } = req.query;
    if (!league || !season) {
      return res.status(400).json({ error: "league et season requis" });
    }

    const data = await apiFootball(
      `/standings?league=${league}&season=${season}`
    );
    res.json(data);
  } catch (err) {
    log(`❌ /standings ${err.message}`);
    res.status(502).json({ error: "Erreur API-Football" });
  }
});

/**
 * Crash protection globale
 */
process.on("unhandledRejection", (err) => {
  log(`🔥 UnhandledRejection: ${err.message}`);
});

process.on("uncaughtException", (err) => {
  log(`🔥 UncaughtException: ${err.message}`);
});

/**
 * Start server
 */
app.listen(PORT, () => {
  log(`🚀 API proxy lancé sur le port ${PORT}`);
});
