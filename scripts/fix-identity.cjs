const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixIdentity() {
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
    // Recreate identity without the generated email column
    await client.query(`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        '2a56df70-4e63-49e8-85d9-565ad16ca49a',
        jsonb_build_object('sub', '2a56df70-4e63-49e8-85d9-565ad16ca49a', 'email', 'admin@infraflow.app', 'email_verified', true),
        'email',
        now(),
        now(),
        now()
      )
    `)
    console.log('Created identity (without generated email column)')

    // Verify
    const { rows: ident } = await client.query(`
      SELECT * FROM auth.identities WHERE user_id = '2a56df70-4e63-49e8-85d9-565ad16ca49a'
    `)
    console.log('Identity:', JSON.stringify(ident[0], null, 2))
  } finally {
    await client.end()
  }
}

fixIdentity().catch(console.error)
