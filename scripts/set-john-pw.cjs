const { Client } = require('pg')

async function main() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.smhckogpgkdppdvranqh',
    password: 'Wali2061ero$',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  // Set password for john.wh@infraflow.app
  await client.query(`
    UPDATE auth.users
    SET encrypted_password = crypt('Test1234!', gen_salt('bf'))
    WHERE email = 'john.wh@infraflow.app'
  `)
  console.log('[OK] Password set for john.wh@infraflow.app')

  await client.end()
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
