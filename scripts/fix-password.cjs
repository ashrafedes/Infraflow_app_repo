const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixPassword() {
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
    await client.query(
      `UPDATE auth.users SET encrypted_password = crypt($1, gen_salt('bf', 10)) WHERE email = $2`,
      ['Test1234!', 'admin@infraflow.app']
    )
    console.log('Password updated with bcrypt cost 10')
  } finally {
    await client.end()
  }
}

fixPassword().catch(console.error)
