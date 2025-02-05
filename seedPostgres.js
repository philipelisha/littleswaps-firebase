const pg = require('pg-promise');
const pgPromise = pg();
const db = pgPromise({
  user: 'myuser',
  password: 'mypassword',
  database: 'mydatabase',
  host: 'localhost',
  port: 5432,
});

async function initDB() {
  try {
    await db.none(`
      CREATE EXTENSION IF NOT EXISTS postgis;
    `)
    const postgisRes = await db.any(`
      SELECT postgis_version();
    `)
    console.log('POSTGIS extension installed version: ', postgisRes);

    await db.none(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY, 
        firestoreid VARCHAR, 
        active BOOLEAN, 
        brand VARCHAR, 
        colors TEXT[], 
        likes INTEGER, 
        location VARCHAR, 
        maincategory VARCHAR, 
        subcategory VARCHAR, 
        mainimage VARCHAR, 
        price INTEGER, 
        size VARCHAR, 
        title VARCHAR, 
        updated TIMESTAMP WITHOUT TIME ZONE, 
        userid VARCHAR, 
        pricecurrency VARCHAR, 
        isnewwithtags BOOLEAN, 
        latitude DOUBLE PRECISION, 
        longitude DOUBLE PRECISION, 
        availableshipping VARCHAR, 
        purchasedate DATE, 
        condition VARCHAR
      );
    `);
    console.log("Created Products Table with Correct Columns");
  } catch (err) {
    console.error("Error initializing database:", err);
  } finally {
    db.$pool.end();
  }
}

initDB().finally(() => console.log("Database Setup Completed"));
