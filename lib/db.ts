/**
 * lib/db.ts — PostgreSQL 数据库连接池
 *
 * 使用 pg（node-postgres）创建单例连接池，整个进程内共享同一个 pool 实例。
 * API Routes 和 lib/orderService 均通过此模块与数据库交互。
 * 连接参数优先读取环境变量，未设置时回退到本地开发默认值。
 */
import { Pool } from 'pg';

// 创建 PostgreSQL 连接池
const pool = new Pool({
  host: process.env.DB_HOST || '192.168.0.105',       // 数据库主机地址
  port: Number(process.env.DB_PORT) || 5432,           // 端口，默认 5432
  database: process.env.DB_NAME || 'mydb',             // 数据库名
  user: process.env.DB_USER || 'postgres',             // 登录用户名
  password: process.env.DB_PASSWORD || 'admin',        // 登录密码
  max: 10,                       // 连接池最大并发连接数
  idleTimeoutMillis: 30000,      // 空闲连接超过 30s 后自动释放
  connectionTimeoutMillis: 2000, // 获取连接最多等待 2s，超时抛出错误
});

export default pool;
