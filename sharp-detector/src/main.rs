//! Sharp Movement Detector — a standalone TxLINE agent.
//!
//! Streams the live TxLINE odds feed, and every 60 seconds compares each market's
//! de-margined consensus to the previous window. When an outcome's implied
//! probability shifts more than the threshold, it logs a "sharp move" signal, and
//! on the next window it checks whether the move held — a running follow-through
//! hit-rate that says whether the signal predicted continued direction.
//!
//! It authorises with the same free World Cup devnet tier as the rest of the
//! project: a guest JWT plus the API token from the environment (TXLINE_API_TOKEN).
//! Fully autonomous once started; deployable as a single binary.

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use serde_json::Value;
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;


#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum Market {
    OneX2,
    Ou25,
    Btts,
}

impl Market {
    fn label(&self) -> &'static str {
        match self {
            Market::OneX2 => "Match Result",
            Market::Ou25 => "Over/Under 2.5",
            Market::Btts => "Both Teams To Score",
        }
    }
    fn outcomes(&self) -> &'static [&'static str] {
        match self {
            Market::OneX2 => &["Home", "Draw", "Away"],
            Market::Ou25 => &["Over 2.5", "Under 2.5"],
            Market::Btts => &["Yes", "No"],
        }
    }
}

/// latest de-margined consensus per (fixture, market)
type State = Arc<Mutex<HashMap<(u64, Market), Vec<f64>>>>;

fn map_market(super_type: &str, params: &str) -> Option<Market> {
    let t = format!("{} {}", super_type, params).to_lowercase();
    if t.contains("1x2") || t.contains("participants") {
        Some(Market::OneX2)
    } else if (t.contains("overunder") || t.contains("total")) && t.contains("2.5") {
        Some(Market::Ou25)
    } else if t.contains("btts") || t.contains("both") {
        Some(Market::Btts)
    } else {
        None
    }
}

fn normalize(pct: &[f64]) -> Vec<f64> {
    let sum: f64 = pct.iter().sum();
    if sum <= 0.0 {
        return pct.to_vec();
    }
    pct.iter().map(|v| v / sum).collect()
}

async fn guest_jwt(auth_url: &str) -> Result<String> {
    let res = reqwest::Client::new()
        .post(format!("{}/auth/guest/start", auth_url))
        .send()
        .await?;
    let v: Value = res.json().await?;
    v.get("token")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("no token in guest/start response"))
}

/// Read the odds SSE and keep `state` current. Reconnects on drop.
async fn odds_stream(api: String, jwt: String, token: String, state: State) {
    let client = reqwest::Client::new();
    loop {
        let req = client
            .get(format!("{}/odds/stream", api))
            .header("Authorization", format!("Bearer {}", jwt))
            .header("X-Api-Token", &token)
            .header("Accept", "text/event-stream");
        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                eprintln!("[odds] connected");
                let mut stream = resp.bytes_stream();
                let mut buf = String::new();
                while let Some(chunk) = stream.next().await {
                    let Ok(bytes) = chunk else { break };
                    buf.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(pos) = buf.find("\n\n") {
                        let frame = buf[..pos].to_string();
                        buf.drain(..pos + 2);
                        for line in frame.lines() {
                            let Some(rest) = line.strip_prefix("data:") else { continue };
                            let Ok(v) = serde_json::from_str::<Value>(rest.trim()) else { continue };
                            handle_odds(&v, &state);
                        }
                    }
                }
            }
            Ok(resp) => eprintln!("[odds] http {}", resp.status()),
            Err(e) => eprintln!("[odds] error: {}", e),
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

fn handle_odds(v: &Value, state: &State) {
    let fixture = v.get("FixtureId").and_then(|x| x.as_u64());
    let super_type = v.get("SuperOddsType").and_then(|x| x.as_str()).unwrap_or("");
    let params = v.get("MarketParameters").and_then(|x| x.as_str()).unwrap_or("");
    // Pct arrives as an array of percentage strings, e.g. ["43.309","42.017","14.678"].
    let pct: Vec<f64> = v
        .get("Pct")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|n| n.as_f64().or_else(|| n.as_str().and_then(|s| s.parse::<f64>().ok())))
                .collect()
        })
        .unwrap_or_default();
    let (Some(fixture), Some(market)) = (fixture, map_market(super_type, params)) else {
        return;
    };
    if pct.is_empty() {
        return;
    }
    state.lock().unwrap().insert((fixture, market), normalize(&pct));
}

struct Pending {
    flagged: usize,
    prob: f64,
}

/// A sharp move: the outcome whose implied probability rose most, and by how much.
#[derive(Debug, Clone, PartialEq)]
struct Detection {
    fixture: u64,
    market: Market,
    flagged: usize,
    delta: f64,
    prob: f64,
}

type Snap = HashMap<(u64, Market), Vec<f64>>;

/// Pure detection: any market whose consensus moved more than `threshold` between
/// two windows produces a Detection flagging the outcome that shortened most.
/// Deterministic (sorted by move size) so it is testable and reproducible.
fn detect_sharp(prev: &Snap, cur: &Snap, threshold: f64) -> Vec<Detection> {
    let mut out = Vec::new();
    for (key, c) in cur {
        let Some(o) = prev.get(key) else { continue };
        if o.len() != c.len() {
            continue;
        }
        let max_abs = c.iter().zip(o).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
        if max_abs < threshold {
            continue;
        }
        let (mut bi, mut bd) = (0usize, f64::MIN);
        for i in 0..c.len() {
            let d = c[i] - o[i];
            if d > bd {
                bd = d;
                bi = i;
            }
        }
        out.push(Detection { fixture: key.0, market: key.1, flagged: bi, delta: bd, prob: c[bi] });
    }
    out.sort_by(|a, b| b.delta.partial_cmp(&a.delta).unwrap_or(std::cmp::Ordering::Equal));
    out
}

fn main() -> Result<()> {
    // credentials from .env.local (written by `npm run subscribe`) or the environment
    let _ = dotenvy::from_filename(".env.local");
    let _ = dotenvy::from_filename("../.env.local");
    let api = std::env::var("TXLINE_API_URL").unwrap_or_else(|_| "https://txline-dev.txodds.com/api".into());
    let auth = api.trim_end_matches("/api").trim_end_matches('/').to_string();
    let token = std::env::var("TXLINE_API_TOKEN")
        .map_err(|_| anyhow!("set TXLINE_API_TOKEN (run `npm run subscribe` first, or export it)"))?;

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(run(api, auth, token))
}

async fn run(api: String, auth: String, token: String) -> Result<()> {
    // WINDOW_SECONDS defaults to 60 (the spec); THRESHOLD_PCT to 5. Both overridable.
    let window_secs: u64 = std::env::var("WINDOW_SECONDS").ok().and_then(|s| s.parse().ok()).unwrap_or(60);
    let threshold: f64 = std::env::var("THRESHOLD_PCT").ok().and_then(|s| s.parse::<f64>().ok()).unwrap_or(5.0) / 100.0;
    let max_secs: Option<u64> = std::env::var("MAX_SECONDS").ok().and_then(|s| s.parse().ok());
    println!(
        "Sharp Movement Detector — TxLINE devnet. Threshold {:.1}%, window {}s. Ctrl-C to stop.",
        threshold * 100.0,
        window_secs
    );
    let jwt = guest_jwt(&auth).await?;

    let state: State = Arc::new(Mutex::new(HashMap::new()));
    tokio::spawn(odds_stream(api.clone(), jwt.clone(), token.clone(), state.clone()));

    let mut prev: HashMap<(u64, Market), Vec<f64>> = HashMap::new();
    let mut pending: HashMap<(u64, Market), Pending> = HashMap::new();
    let (mut hits, mut total) = (0u32, 0u32);
    let mut log = std::fs::OpenOptions::new().create(true).append(true).open("signals.jsonl")?;

    let mut ticker = tokio::time::interval(Duration::from_secs(window_secs));
    ticker.tick().await; // first tick fires immediately; skip it (no baseline yet)
    let mut ctrlc = Box::pin(tokio::signal::ctrl_c());
    let deadline = max_secs.map(|s| tokio::time::Instant::now() + Duration::from_secs(s));

    loop {
        let stop = async {
            match deadline {
                Some(d) => tokio::time::sleep_until(d).await,
                None => std::future::pending::<()>().await,
            }
        };
        tokio::select! {
            _ = ticker.tick() => {}
            _ = &mut ctrlc => {
                println!("\nstopped. follow-through hit-rate: {}/{}", hits, total);
                return Ok(());
            }
            _ = stop => {
                println!("\n[max-seconds reached] follow-through hit-rate: {}/{}", hits, total);
                return Ok(());
            }
        }

        let snapshot = state.lock().unwrap().clone();
        let now = chrono::Utc::now();

        // 1) resolve last window's signals — did the flagged move hold?
        for (key, p) in pending.drain() {
            if let Some(cur) = snapshot.get(&key) {
                total += 1;
                if cur.get(p.flagged).copied().unwrap_or(0.0) + 1e-9 >= p.prob {
                    hits += 1;
                }
            }
        }

        // 2) detect new sharp moves vs the previous window
        for det in detect_sharp(&prev, &snapshot, threshold) {
            let outcome = det.market.outcomes()[det.flagged];
            println!(
                "{}  SHARP  fixture {}  {}  {} shortening {:+.1}pp -> {:.0}%",
                now.format("%H:%M:%S"),
                det.fixture,
                det.market.label(),
                outcome,
                det.delta * 100.0,
                det.prob * 100.0
            );
            let _ = writeln!(
                log,
                "{}",
                serde_json::json!({
                    "ts": now.to_rfc3339(),
                    "fixtureId": det.fixture,
                    "market": det.market.label(),
                    "outcome": outcome,
                    "deltaPct": (det.delta * 100.0),
                    "probPct": (det.prob * 100.0),
                })
            );
            pending.insert((det.fixture, det.market), Pending { flagged: det.flagged, prob: det.prob });
        }

        print!("  [window: tracking {} markets", snapshot.len());
        if total > 0 {
            print!(", follow-through hit-rate {:.0}% ({}/{})", (hits as f64 / total as f64) * 100.0, hits, total);
        }
        println!("]");
        prev = snapshot;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(v: &[(u64, Market, Vec<f64>)]) -> Snap {
        v.iter().cloned().map(|(f, m, c)| ((f, m), c)).collect()
    }

    #[test]
    fn flags_a_sharp_move_and_the_right_outcome() {
        let prev = snap(&[(1, Market::OneX2, vec![0.40, 0.30, 0.30])]);
        let cur = snap(&[(1, Market::OneX2, vec![0.55, 0.25, 0.20])]);
        let d = detect_sharp(&prev, &cur, 0.05);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].flagged, 0); // Home shortened most
        assert!((d[0].delta - 0.15).abs() < 1e-9);
    }

    #[test]
    fn ignores_moves_below_threshold() {
        let prev = snap(&[(1, Market::OneX2, vec![0.40, 0.30, 0.30])]);
        let cur = snap(&[(1, Market::OneX2, vec![0.41, 0.30, 0.29])]);
        assert!(detect_sharp(&prev, &cur, 0.05).is_empty());
    }

    #[test]
    fn needs_a_baseline_window() {
        let cur = snap(&[(1, Market::OneX2, vec![0.55, 0.25, 0.20])]);
        assert!(detect_sharp(&Snap::new(), &cur, 0.05).is_empty());
    }

    #[test]
    fn normalize_scales_percentage_strings_to_one() {
        let n = normalize(&[43.309, 42.017, 14.678]);
        assert!((n.iter().sum::<f64>() - 1.0).abs() < 1e-9);
        assert!((n[0] - 0.4331).abs() < 1e-3);
    }

    #[test]
    fn maps_txline_market_types() {
        assert_eq!(map_market("1X2_PARTICIPANT_RESULT", ""), Some(Market::OneX2));
        assert_eq!(map_market("OVERUNDER_PARTICIPANT_GOALS", "line=2.5"), Some(Market::Ou25));
        assert_eq!(map_market("ASIANHANDICAP_PARTICIPANT_GOALS", "line=0"), None);
    }
}
