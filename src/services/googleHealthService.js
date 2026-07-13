const TEST_ACCOUNT = "abhishek.66singh@gmail.com";
const FITNESS_SCOPES = "https://www.googleapis.com/auth/fitness.activity.read";
const STRIDE_LENGTH_KM = 0.000762;

function getMET(speedKmh) {
  if (speedKmh < 3) return 2.0;
  if (speedKmh < 4.5) return 2.8;
  if (speedKmh < 5.5) return 3.5;
  if (speedKmh < 7) return 4.3;
  if (speedKmh < 9) return 7.0;
  if (speedKmh < 11) return 10.5;
  return 12.5;
}

export function isHealthSyncAvailable(userEmail) {
  return true;
}

export function buildGoogleFitnessAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: FITNESS_SCOPES,
    include_granted_scopes: "true",
    access_type: "online",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function fetchGoogleFitnessToday(accessToken, weightKg = 70, heightCm = 170) {
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const startMs = midnight.getTime();
  const endMs = now;

  // Fetch activity sessions for today — each session has precise start/end time
  // so we can calculate actual speed per session (walk vs run vs cycle)
  const sessions = await fetchSessions(accessToken, startMs, endMs);

  let totalCalories = 0;
  let totalSteps = 0;
  let totalDistanceKm = 0;
  const heightFactor = heightCm / 170;

  if (sessions.length > 0) {
    // Calculate calories per session using actual session duration
    for (const session of sessions) {
      const sessionSteps = await fetchStepsForWindow(
        accessToken,
        parseInt(session.startTimeMillis),
        parseInt(session.endTimeMillis)
      );
      const sessionDurationHours = (parseInt(session.endTimeMillis) - parseInt(session.startTimeMillis)) / 3600000;
      const sessionDistanceKm = sessionSteps * STRIDE_LENGTH_KM * heightFactor;

      // Speed = distance / time → determines MET (walk vs jog vs run)
      const speedKmh = sessionDurationHours > 0 ? sessionDistanceKm / sessionDurationHours : 4;
      const met = getMET(speedKmh);
      const sessionCalories = Math.round(met * weightKg * sessionDurationHours);

      totalSteps += sessionSteps;
      totalCalories += sessionCalories;
      totalDistanceKm += sessionDistanceKm;
    }
    totalDistanceKm = Math.round(totalDistanceKm * 100) / 100;
  } else {
    // No sessions recorded — fall back to aggregate steps with time-of-day estimate
    // Use actual elapsed time since first step (best estimate without session data)
    totalSteps = await fetchTotalSteps(accessToken, startMs, endMs);

    if (totalSteps > 0) {
      // Estimate: assume activity happened in a 1-hour window as a conservative default
      // This is honest — we can't know the actual duration without session data
      const estimatedDurationHours = Math.min(
        (endMs - startMs) / 3600000, // full day max
        totalSteps / 5000             // rough estimate: ~5000 steps/hour average
      );
      const distanceKm = totalSteps * STRIDE_LENGTH_KM * heightFactor;
      const speedKmh = estimatedDurationHours > 0 ? distanceKm / estimatedDurationHours : 4;
      const met = getMET(speedKmh);
      totalCalories = Math.round(met * weightKg * estimatedDurationHours);
      totalDistanceKm = Math.round(distanceKm * 100) / 100;
    }
  }

  return {
    steps: totalSteps,
    caloriesBurned: totalCalories,
    distanceKm: totalDistanceKm,
    sessionsFound: sessions.length,
  };
}

// Fetch activity sessions for a time window
async function fetchSessions(accessToken, startMs, endMs) {
  const url = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startMs).toISOString()}&endTime=${new Date(endMs).toISOString()}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return [];
    const data = await res.json();
    // Filter to walking/running/cycling activity types
    // activityType: 7=walking, 8=running, 9=cycling, 3=biking
    const ACTIVE_TYPES = [7, 8, 9, 3, 56, 97, 111]; // common active types
    return (data.session || []).filter(s =>
      ACTIVE_TYPES.includes(s.activityType) &&
      parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis) > 60000 // at least 1 min
    );
  } catch { return []; }
}

// Fetch step count for a specific time window (for per-session accuracy)
async function fetchStepsForWindow(accessToken, startMs, endMs) {
  const body = {
    aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
    bucketByTime: { durationMillis: endMs - startMs },
    startTimeMillis: startMs,
    endTimeMillis: endMs,
  };
  try {
    const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    let steps = 0;
    for (const bucket of data.bucket || []) {
      for (const dataset of bucket.dataset || []) {
        for (const point of dataset.point || []) {
          if (point.dataTypeName === "com.google.step_count.delta") {
            steps += point.value?.[0]?.intVal || 0;
          }
        }
      }
    }
    return steps;
  } catch { return 0; }
}

// Total steps for the whole day (used when no sessions are found)
async function fetchTotalSteps(accessToken, startMs, endMs) {
  const steps = await fetchStepsForWindow(accessToken, startMs, endMs);
  if (steps > 0) return steps;
  // Fallback to direct data source
  const startNs = startMs * 1000000;
  const endNs = endMs * 1000000;
  const dataSourceId = "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps";
  const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(dataSourceId)}/datasets/${startNs}-${endNs}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    let total = 0;
    for (const point of data.point || []) {
      total += point.value?.[0]?.intVal || 0;
    }
    return total;
  } catch { return 0; }
}

export function saveAccessToken(token) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("vb_fitness_token", token);
    sessionStorage.setItem("vb_fitness_token_time", Date.now().toString());
  }
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem("vb_fitness_token");
  const time = parseInt(sessionStorage.getItem("vb_fitness_token_time") || "0");
  if (Date.now() - time > 55 * 60 * 1000) {
    sessionStorage.removeItem("vb_fitness_token");
    return null;
  }
  return token || null;
}

export function clearAccessToken() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("vb_fitness_token");
    sessionStorage.removeItem("vb_fitness_token_time");
  }
}

export function parseTokenFromUrl() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.substring(1));
  const token = params.get("access_token");
  if (token) {
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return null;
}
