import { connectToPostgres } from "./connectToPostgres";

describe('connectToPostgres', () => {
  it('should establish a DB connection using env variables', async () => {
    process.env.DB_HOST = 'your-mock-host'
    process.env.DB_PORT = 'your-mock-port'
    process.env.DB_NAME = 'your-mock-name'
    process.env.DB_USER = 'your-mock-user'
    process.env.DB_PASSWORD = 'your-mock-password'

    const dbConnection = connectToPostgres();
    expect(dbConnection).toBeDefined();
  });
});
