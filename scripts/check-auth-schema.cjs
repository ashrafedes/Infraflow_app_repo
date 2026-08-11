const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function checkAuthSchema() {
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
    // List all tables in auth schema
    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'auth' ORDER BY table_name
    `)
    console.log('Auth tables:')
    tables.forEach(t => console.log(`  ${t.table_name}`))

    // Check for flow_state table (required by newer GoTrue)
    const hasFlowState = tables.some(t => t.table_name === 'flow_state')
    console.log('\nflow_state table exists:', hasFlowState)

    // Check auth schema version
    const { rows: versions } = await client.query(`
      SELECT version FROM auth.schema_migrations ORDER BY version DESC LIMIT 5
    `)
    console.log('\nRecent auth migrations:', versions.map(v => v.version).join(', '))

    // Check if the user has all required columns populated
    const { rows: user } = await client.query(`
      SELECT id, email, aud, role, email_confirmed_at, phone, phone_confirmed_at,
             confirmation_token, recovery_token, email_change, email_change_token_new,
             raw_app_meta_data, raw_user_meta_data, is_sso_user, deleted_at
      FROM auth.users WHERE email = 'admin@infraflow.app'
    `)
    console.log('\nUser details:', JSON.stringify(user[0], null, 2))

    // Check for any broken/invalid functions in auth schema
    const { rows: badFuncs } = await client.query(`
      SELECT p.proname, n.nspname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname IN ('auth', 'public')
      AND p.prosrc IS NOT NULL
      AND (p.prosrc LIKE '%auth.users%' OR p.prosrc LIKE '%auth.identities%')
      ORDER BY n.nspname, p.proname
    `)
    console.log('\nFunctions referencing auth tables:')
    badFuncs.forEach(f => console.log(`  ${f.nspname}.${f.proname}`))
  } finally {
    await client.end()
  }
}

checkAuthSchema().catch(console.error)
