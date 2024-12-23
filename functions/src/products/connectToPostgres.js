import pg from 'pg-promise';
const pgPromise = pg();

export const connectToPostgres = () => {
  const pgConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  return pgPromise(pgConfig);
};
