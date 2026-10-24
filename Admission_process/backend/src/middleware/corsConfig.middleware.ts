import cors from 'cors';

// Retrieve allowed origins from environment
const frontendUrlEnv = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : [];

const allowedOriginsEnv = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : [];

const defaultAllowedOrigins = [
  'https://jcererp.pages.dev',
  'https://jcererp-system.pages.dev',
  'https://jcer-admission-portal.pages.dev',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const allAllowedOrigins = [...new Set([...allowedOriginsEnv, ...frontendUrlEnv, ...defaultAllowedOrigins])];

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (process.env.FRONTEND_URL === '*' || process.env.CORS_ORIGIN === '*') {
      return callback(null, true);
    }

    const isExplicitlyAllowed = allAllowedOrigins.includes(origin);
    const isCloudflarePages = origin.endsWith('.pages.dev') || origin.includes('pages.dev');
    const isRenderFrontend = origin.endsWith('.onrender.com');
    const isRailwayFrontend = origin.endsWith('.railway.app') || origin.endsWith('.up.railway.app');
    const isVercelFrontend = origin.endsWith('.vercel.app');
    const isTunnel =
      origin.endsWith('.trycloudflare.com') ||
      origin.endsWith('.loca.lt') ||
      origin.endsWith('.ngrok-free.app') ||
      origin.endsWith('.ngrok.io');
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isPrivateIP = /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);

    if (isExplicitlyAllowed || isCloudflarePages || isRenderFrontend || isRailwayFrontend || isVercelFrontend || isTunnel || isLocalhost || isPrivateIP) {
      return callback(null, true);
    }

    // Default fallback: return true so browser receives valid CORS headers
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-correlation-id',
    'x-idempotency-key',
    'Cache-Control',
    'Pragma',
    'Expires',
    'x-no-compression',
    'X-No-Compression',
    'X-Content-Type-Options',
  ],
  exposedHeaders: [
    'x-correlation-id',
    'Set-Cookie',
    'Content-Disposition',
    'Content-Length',
    'Content-Type',
    'Content-Encoding',
    'Cache-Control',
    'X-No-Compression',
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400,
});
