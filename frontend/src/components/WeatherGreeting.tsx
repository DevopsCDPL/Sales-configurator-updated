import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, alpha, Skeleton } from '@mui/material';

/* ═══════════════════════════════════════════════════════════════════════
   SINGLE WEATHER EMOJI per condition — auto-changes with real weather
   ═══════════════════════════════════════════════════════════════════════ */
const CONDITION_EMOJI: Record<string, string> = {
  sunny:       '☀️',
  rainy:       '🌧️',
  cloudy:      '☁️',
  snowy:       '❄️',
  stormy:      '⛈️',
  clear_night: '🌙',
  default:     '🌤️',
};

/* ═══════════════════════════════════════════════════════════════════════
   GREETINGS — Gen Z style, time-based. No emojis here.
   ═══════════════════════════════════════════════════════════════════════ */
const GREETINGS: Record<string, string[]> = {
  morning: [
    'Good Morning',
    'Morning vibes',
    'Rise and shine',
    'Fresh morning energy',
    'Bright morning ahead',
  ],
  afternoon: [
    'Good Afternoon',
    'Afternoon hustle',
    'Midday momentum',
    'Afternoon energy loaded',
    'Peak afternoon hours',
  ],
  evening: [
    'Good Evening',
    'Evening glow',
    'Golden hour vibes',
    'Evening wind down',
    'Twilight mode on',
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   SUBTITLE POOLS — max 5 words, encouraging weather enjoyment.
   No emojis. Rotates via localStorage so they don't repeat frequently.
   ═══════════════════════════════════════════════════════════════════════ */
const SUBTITLES: Record<string, string[]> = {
  sunny: [
    'Enjoy the sunshine today',
    'Perfect day outside',
    'Sunshine fuels great work',
    'Bright skies, bright ideas',
    'Soak up the sun',
    'Clear skies all day',
    'Sun-kissed productivity ahead',
    'Radiant day for wins',
  ],
  rainy: [
    'Cozy rain day vibes',
    'Rainy days inspire focus',
    'Let rain fuel creativity',
    'Fresh air feels great',
    'Rain brings calm energy',
    'Perfect for deep work',
    'Embrace the rainy mood',
    'Rain sharpens the mind',
  ],
  cloudy: [
    'Soft skies, steady grind',
    'Cloudy but productive vibes',
    'Enjoy the cool breeze',
    'Overcast and overachieving today',
    'Calm skies, clear focus',
    'Gentle weather, big moves',
    'Clouds set the mood',
    'Mellow weather, sharp mind',
  ],
  snowy: [
    'Enjoy the winter magic',
    'Snowy vibes feel great',
    'Cozy up and create',
    'Winter energy hits different',
    'Frosty air, warm ideas',
    'Snow day productivity mode',
    'Chill weather, hot ideas',
    'Embrace the snowy calm',
  ],
  stormy: [
    'Storms spark big energy',
    'Wild weather, wilder ambition',
    'Thunder fuels the hustle',
    'Storm outside, calm inside',
    'Powerful weather, powerful focus',
    'Channel the storm energy',
    'Ride the storm waves',
    'Stormy skies, steady hands',
  ],
  clear_night: [
    'Night sky looks amazing',
    'Starry night, steady grind',
    'Moonlit vibes hit different',
    'Enjoy the calm night',
    'Night air feels great',
    'Peaceful evening, great energy',
    'Clear night, clear mind',
    'Cool night, warm focus',
  ],
  default: [
    'Make the most today',
    'Enjoy the weather vibes',
    'Perfect day for progress',
    'Fresh air feels great',
    'Great day to shine',
    'Weather looks good today',
    'Nice vibes all around',
    'Good energy surrounds you',
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   SUBTITLE ROTATION — localStorage-based, avoids frequent repeats
   ═══════════════════════════════════════════════════════════════════════ */
const ROTATION_KEY = 'fg_subtitle_history';

interface RotationHistory { [condKey: string]: number[] }

function getRotationHistory(): RotationHistory {
  try { return JSON.parse(localStorage.getItem(ROTATION_KEY) || '{}'); } catch { return {}; }
}
function saveRotationHistory(h: RotationHistory) {
  try { localStorage.setItem(ROTATION_KEY, JSON.stringify(h)); } catch {}
}

/** Pick a subtitle index that hasn't been used recently */
function pickSubtitle(condKey: string): string {
  const pool = SUBTITLES[condKey] || SUBTITLES.default;
  const history = getRotationHistory();
  const used = history[condKey] || [];

  // Find indices not recently used
  const available = pool.map((_, i) => i).filter(i => !used.includes(i));
  const pickFrom = available.length > 0 ? available : pool.map((_, i) => i);

  const idx = pickFrom[Math.floor(Math.random() * pickFrom.length)];

  // Update history — keep last half of pool size to avoid repeats
  const maxHistory = Math.floor(pool.length / 2);
  const updated = [...used, idx].slice(-maxHistory);
  history[condKey] = updated;
  saveRotationHistory(history);

  return pool[idx];
}

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

function getTimeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12)  return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

function mapCondition(desc: string, isNight: boolean): string {
  const d = desc.toLowerCase();
  if (/thunder|storm|lightning/.test(d))                  return 'stormy';
  if (/snow|sleet|blizzard|flurr/.test(d))                return 'snowy';
  if (/rain|drizzle|shower/.test(d))                      return 'rainy';
  if (/cloud|overcast|fog|mist|haze/.test(d))             return 'cloudy';
  if (/clear|sun/.test(d)) return isNight ? 'clear_night' : 'sunny';
  if (isNight) return 'clear_night';
  return 'default';
}

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
interface Props {
  userName?: string;
}

interface WeatherData {
  temp: number;
  condition: string;
  condKey: string;
  city: string;
}

const WEATHER_CACHE_KEY = 'fg_weather_cache';
const CACHE_TTL = 10 * 60 * 1000;

function getCachedWeather(): WeatherData | null {
  try {
    const raw = sessionStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(WEATHER_CACHE_KEY); return null; }
    return data as WeatherData;
  } catch { return null; }
}
function setCachedWeather(data: WeatherData) {
  try { sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function buildMessages(wd: WeatherData | null) {
  const hour     = new Date().getHours();
  const tod      = getTimeOfDay(hour);
  const greeting = pick(GREETINGS[tod]);
  const ck       = wd?.condKey || 'default';
  const subtitle = pickSubtitle(ck);

  const weatherMsg = wd
    ? `${wd.temp}°C in ${wd.city}. ${subtitle}`
    : subtitle;

  return { greeting, weatherMsg, condKey: ck };
}

const WeatherGreeting: React.FC<Props> = () => {

  const [, setWeather]              = useState<WeatherData | null>(getCachedWeather);
  const [loading, setLoading]       = useState(!getCachedWeather());
  const [greeting, setGreeting]     = useState('');
  const [weatherMsg, setWeatherMsg] = useState('');
  const [condKey, setCondKey]       = useState('default');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const cached = getCachedWeather();
    if (cached) {
      const m = buildMessages(cached);
      setGreeting(m.greeting);
      setWeatherMsg(m.weatherMsg);
      setCondKey(m.condKey);
      setWeather(cached);
      setLoading(false);
    } else {
      const hour = new Date().getHours();
      const tod  = getTimeOfDay(hour);
      setGreeting(pick(GREETINGS[tod]));
      setWeatherMsg(pickSubtitle('default'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (getCachedWeather()) return;
    let cancelled = false;
    (async () => {
      try {
        const geoRes = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
        const geo    = await geoRes.json();
        const city   = geo.city || geo.region || 'your area';
        const lat    = geo.latitude;
        const lon    = geo.longitude;
        if (cancelled) return;

        const wRes    = await fetch(`https://wttr.in/${lat},${lon}?format=j1`, { signal: AbortSignal.timeout(5000) });
        const wData   = await wRes.json();
        const current = wData?.current_condition?.[0];
        if (cancelled || !current) { if (mounted.current) setLoading(false); return; }

        const temp    = parseInt(current.temp_C, 10);
        const desc    = current.weatherDesc?.[0]?.value || '';
        const hour    = new Date().getHours();
        const isNight = hour < 6 || hour >= 19;
        const ck      = mapCondition(desc, isNight);
        const condition = desc || (ck === 'sunny' ? 'Sunny' : ck.charAt(0).toUpperCase() + ck.slice(1));

        const wd: WeatherData = { temp, condition, condKey: ck, city };
        setCachedWeather(wd);

        if (mounted.current) {
          setWeather(wd);
          const m = buildMessages(wd);
          setGreeting(m.greeting);
          setWeatherMsg(m.weatherMsg);
          setCondKey(m.condKey);
          setLoading(false);
        }
      } catch {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 3,
        bgcolor: 'var(--bg-surface)', border: '1px solid', borderColor: 'var(--border)',
        boxShadow: 'none', minWidth: 220 }}>
        <Skeleton variant="circular" width={38} height={38} />
        <Box>
          <Skeleton variant="text" width={160} height={18} />
          <Skeleton variant="text" width={200} height={14} sx={{ mt: 0.25 }} />
        </Box>
      </Box>
    );
  }

  const ck = condKey;
  const emoji = CONDITION_EMOJI[ck] || CONDITION_EMOJI.default;

  const gradients: Record<string, string> = {
    sunny:       'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)',
    rainy:       'linear-gradient(135deg, #E5E7EB 0%, #bae6fd 100%)',
    cloudy:      'linear-gradient(135deg, #f1f5f9 0%, #E5E7EB 100%)',
    snowy:       'linear-gradient(135deg, #eff6ff 0%, #E5E7EB 100%)',
    stormy:      'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
    clear_night: 'linear-gradient(135deg, #1F2937 0%, #334155 100%)',
    default:     'linear-gradient(135deg, #FAFBFC 0%, #E5E7EB 100%)',
  };
  const isNightTheme = ck === 'clear_night';
  const textPrimary   = isNightTheme ? '#f1f5f9' : '#1F2937';
  const textSecondary = isNightTheme ? '#94a3b8' : '#6B7280';

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      p: '10px 16px', borderRadius: 3,
      background: gradients[ck] || gradients.default,
      border: '1px solid', borderColor: alpha('#000', 0.05),
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      maxWidth: 420, transition: 'all 0.3s ease',
      '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)', transform: 'translateY(-1px)' },
    }}>
      {/* Single weather emoji */}
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', fontSize: '2rem', lineHeight: 1 }}>
        {emoji}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: textPrimary, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {greeting}
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: textSecondary, lineHeight: 1.4, mt: 0.15,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {weatherMsg}
        </Typography>
      </Box>
    </Box>
  );
};

export default WeatherGreeting;
