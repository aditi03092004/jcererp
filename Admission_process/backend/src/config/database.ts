import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import { contextStorage } from '../utils/context.util';
import logger from '../utils/logger.util';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Safely sanitize string URLs (strip outer quotes, whitespace)
function getSanitizedUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const cleaned = url.trim().replace(/^["']|["']$/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}

// 1. Highest Priority: DATABASE_URL (Standard Railway Postgres reference)
// 2. Secondary Priority: DATABASE_PRIVATE_URL / DATABASE_PUBLIC_URL / POSTGRES_URL
const databaseUrl =
  getSanitizedUrl(process.env.DATABASE_URL) ||
  getSanitizedUrl(process.env.DATABASE_PRIVATE_URL) ||
  getSanitizedUrl(process.env.DATABASE_PUBLIC_URL) ||
  getSanitizedUrl(process.env.POSTGRES_URL);

let connectionSource = 'NONE';
let resolvedHost = '';
let resolvedDatabase = '';
let sequelize: Sequelize;

// SSL Detection
const isCloudPostgres = Boolean(
  databaseUrl &&
    (databaseUrl.includes('sslmode=require') ||
      databaseUrl.includes('rlwy.net') ||
      databaseUrl.includes('railway.app') ||
      databaseUrl.includes('render.com') ||
      databaseUrl.includes('postgres.render.com') ||
      databaseUrl.includes('neon.tech') ||
      databaseUrl.includes('supabase.co'))
);

const useSSL =
  process.env.DB_SSL === 'true' ||
  (process.env.DB_SSL !== 'false' && isCloudPostgres);

const dialectOptions = useSSL
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }
  : {};

if (databaseUrl) {
  if (getSanitizedUrl(process.env.DATABASE_URL)) {
    connectionSource = 'DATABASE_URL';
  } else if (getSanitizedUrl(process.env.DATABASE_PRIVATE_URL)) {
    connectionSource = 'DATABASE_PRIVATE_URL';
  } else if (getSanitizedUrl(process.env.DATABASE_PUBLIC_URL)) {
    connectionSource = 'DATABASE_PUBLIC_URL';
  } else {
    connectionSource = 'POSTGRES_URL';
  }

  try {
    const parsed = new URL(databaseUrl);
    resolvedHost = parsed.hostname;
    resolvedDatabase = parsed.pathname.replace(/^\//, '');
  } catch {
    resolvedHost = 'Cloud PostgreSQL';
    resolvedDatabase = 'Cloud PostgreSQL database';
  }

  // Initialize Sequelize directly with the sanitized database URL
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    dialectOptions,
    logging: !isProduction ? console.log : false,
    pool: {
      max: 50,
      min: 5,
      acquire: 30000,
      idle: 10000,
    },
  });
} else if (process.env.PGHOST || process.env.DB_HOST) {
  // Discrete host/port/db variables (e.g. Docker Compose or direct parameters)
  connectionSource = process.env.PGHOST ? 'PGHOST' : 'DB_HOST';
  resolvedHost = (process.env.PGHOST || process.env.DB_HOST || '').trim().replace(/^["']|["']$/g, '');
  const port = parseInt((process.env.PGPORT || process.env.DB_PORT || '5432').trim().replace(/^["']|["']$/g, ''), 10);
  resolvedDatabase = (process.env.PGDATABASE || process.env.DB_NAME || process.env.POSTGRES_DB || 'college_erp_db').trim().replace(/^["']|["']$/g, '');
  const user = (process.env.PGUSER || process.env.DB_USER || process.env.POSTGRES_USER || 'erp_user').trim().replace(/^["']|["']$/g, '');
  const password = (process.env.PGPASSWORD || process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '').trim().replace(/^["']|["']$/g, '');

  sequelize = new Sequelize(
    resolvedDatabase,
    user,
    password,
    {
      host: resolvedHost,
      port: port,
      dialect: 'postgres',
      dialectOptions,
      logging: !isProduction ? console.log : false,
      pool: {
        max: 50,
        min: 5,
        acquire: 30000,
        idle: 10000,
      },
    }
  );
} else if (!isProduction) {
  // Local development fallback ONLY when NOT in production
  connectionSource = 'LOCAL_DEV_FALLBACK';
  resolvedHost = 'localhost';
  resolvedDatabase = 'college_erp_db';

  sequelize = new Sequelize(
    resolvedDatabase,
    'erp_user',
    'erp_password_123',
    {
      host: resolvedHost,
      port: 5432,
      dialect: 'postgres',
      dialectOptions,
      logging: console.log,
      pool: {
        max: 50,
        min: 5,
        acquire: 30000,
        idle: 10000,
      },
    }
  );
} else {
  // In production, when DATABASE_URL is missing, fail immediately and clearly
  connectionSource = 'MISSING';
  resolvedHost = 'UNCONFIGURED';
  resolvedDatabase = 'UNCONFIGURED';

  sequelize = new Sequelize('postgres://unconfigured:unconfigured@unconfigured:5432/unconfigured', {
    dialect: 'postgres',
    logging: false,
  });
}

/**
 * Diagnostic logger called at startup in index.ts
 */
export function logDatabaseConfiguration(): void {
  console.log('\n==================================================');
  console.log('DATABASE CONFIGURATION:');
  console.log(`- NODE_ENV:          ${process.env.NODE_ENV || 'development'}`);
  console.log(`- Connection source: ${connectionSource}`);
  console.log(`- Host:              ${resolvedHost || 'None'}`);
  console.log(`- Database:          ${resolvedDatabase || 'None'}`);
  console.log('==================================================\n');

  if (isProduction && connectionSource === 'MISSING') {
    console.error('❌ FATAL: DATABASE_URL is not configured for production.');
    console.error('Please configure DATABASE_URL in your Render/cloud service environment variables.');
    throw new Error('DATABASE_URL is not configured for production.');
  }
}

export function getSafeDatabaseTargetInfo(): string {
  return `${resolvedHost || 'unknown'}/${resolvedDatabase || 'unknown'}`;
}

// RLS Hook: SET session variables before executing query
sequelize.addHook('beforeQuery', async (options: any) => {
  // Check if DB RLS is enabled
  if (process.env.DB_RLS_ENABLED !== 'true') return;

  const context = contextStorage.getStore();
  if (context && options.connection) {
    // Sanitize to prevent SQL injection in session setting
    const userId = context.userId.replace(/[^a-zA-Z0-9-]/g, '');
    const role = context.role.replace(/[^a-zA-Z0-9_-]/g, '');

    const isTransaction = !!options.transaction;
    const command = isTransaction ? 'SET LOCAL' : 'SET';

    try {
      await options.connection.query(`${command} app.current_user_id = '${userId}';`);
      await options.connection.query(`${command} app.current_user_role = '${role}';`);
    } catch (err: any) {
      logger.error(`RLS beforeQuery SET failed: ${err.message}`, { correlationId: options.correlationId });
    }
  }
});

// RLS Hook: RESET session variables after query completes to prevent pool leakage
sequelize.addHook('afterQuery', async (options: any) => {
  if (process.env.DB_RLS_ENABLED !== 'true') return;

  // We only need to manually RESET if it was set session-wide (outside a transaction)
  // Postgres automatically discards SET LOCAL when a transaction block finishes
  const isTransaction = !!options.transaction;
  const context = contextStorage.getStore();

  if (context && !isTransaction && options.connection) {
    try {
      await options.connection.query(`RESET app.current_user_id;`);
      await options.connection.query(`RESET app.current_user_role;`);
    } catch (err: any) {
      logger.error(`RLS afterQuery RESET failed: ${err.message}`);
    }
  }
});

export default sequelize;
