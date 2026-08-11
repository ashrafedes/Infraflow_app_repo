const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function checkUser() {
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
    const { rows } = await client.query(
      `SELECT id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, encrypted_password FROM auth.users WHERE email = $1`,
      ['admin@infraflow.app']
    )
    console.log('Auth user:', JSON.stringify(rows[0], null, 2))

    const { rows: profiles } = await client.query(
      `SELECT * FROM public.user_profiles WHERE email = $1`,
      ['admin@infraflow.app']
    )
    console.log('Profile:', JSON.stringify(profiles[0], null, 2))

    const { rows: identities } = await client.query(
      `SELECT * FROM auth.identities WHERE user_id = $1`,
      [rows[0]?.id]
    )
    console.log('Identities:', JSON.stringify(identities, null, 2))
  } finally {
    await client.end()
  }
}

checkUser().catch(console.error)
