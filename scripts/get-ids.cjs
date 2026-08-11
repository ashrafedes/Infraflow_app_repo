const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function getIds() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  try {
    const { rows: suppliers } = await client.query(`SELECT id, name FROM suppliers LIMIT 5`)
    console.log('Suppliers:', JSON.stringify(suppliers, null, 2))

    const { rows: warehouses } = await client.query(`SELECT id, name FROM warehouses LIMIT 5`)
    console.log('Warehouses:', JSON.stringify(warehouses, null, 2))

    const { rows: materials } = await client.query(`SELECT id, item_number, short_description FROM materials LIMIT 5`)
    console.log('Materials:', JSON.stringify(materials, null, 2))
  } finally {
    await client.end()
  }
}

getIds().catch(console.error)
