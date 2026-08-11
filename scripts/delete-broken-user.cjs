const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function deleteBrokenUser() {
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
    // Delete the user profile first (to avoid FK issues)
    await client.query(`DELETE FROM public.user_profiles WHERE email = 'admin@infraflow.app'`)
    console.log('Deleted user_profiles row')

    // Delete identities
    await client.query(`DELETE FROM auth.identities WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@infraflow.app')`)
    console.log('Deleted identities')

    // Delete sessions
    await client.query(`DELETE FROM auth.sessions WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@infraflow.app')`)
    console.log('Deleted sessions')

    // Delete the auth user
    await client.query(`DELETE FROM auth.users WHERE email = 'admin@infraflow.app'`)
    console.log('Deleted auth user')

    // Verify
    const { rows } = await client.query(`SELECT count(*) as count FROM auth.users WHERE email = 'admin@infraflow.app'`)
    console.log('Remaining users with that email:', rows[0].count)
  } finally {
    await client.end()
  }
}

deleteBrokenUser().catch(console.error)
