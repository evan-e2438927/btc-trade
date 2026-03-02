import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || '192.168.0.105',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mydb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default pool;
