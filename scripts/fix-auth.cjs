const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixAuth() {
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
    // Check if handle_new_user exists
    const { rows: funcs } = await client.query(`
      SELECT p.proname, n.nspname, pg_get_function_arguments(p.oid) as args,
             pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'handle_new_user'
    `)
    console.log('handle_new_user functions:', funcs.length)
    funcs.forEach(f => console.log(`  Schema: ${f.nspname}, Args: ${f.args}`))

    // Check the trigger definition
    const { rows: triggers } = await client.query(`
      SELECT pg_get_triggerdef(oid) as definition
      FROM pg_trigger
      WHERE tgname = 'on_auth_user_created'
    `)
    console.log('\nTrigger:', triggers[0]?.definition)

    // Check if there's a session table issue
    const { rows: sessions } = await client.query(`
      SELECT count(*) as count FROM auth.sessions
    `)
    console.log('\nSessions count:', sessions[0].count)

    // Try to clean up sessions for this user
    await client.query(`DELETE FROM auth.sessions WHERE user_id = '2a56df70-4e63-49e8-85d9-565ad16ca49a'`)
    console.log('Cleaned sessions')

    // Check the user's banned_until and other auth fields
    const { rows: user } = await client.query(`
      SELECT id, email, banned_until, banned_until IS NOT NULL as is_banned,
             email_confirmed_at IS NOT NULL as email_confirmed,
             raw_app_meta_data
      FROM auth.users
      WHERE email = 'admin@infraflow.app'
    `)
    console.log('\nUser auth state:', JSON.stringify(user[0], null, 2))

    // Check if the user is banned
    if (user[0]?.is_banned) {
      await client.query(`UPDATE auth.users SET banned_until = NULL WHERE email = 'admin@infraflow.app'`)
      console.log('Unbanned user')
    }

    // Check auth.audit_log entries for errors
    const { rows: audit } = await client.query(`
      SELECT created_at, payload
      FROM auth.audit_log_entries
      WHERE payload->>'user_id' = '2a56df70-4e63-49e8-85d9-565ad16ca49a'
      ORDER BY created_at DESC
      LIMIT 5
    `)
    console.log('\nRecent audit entries:')
    audit.forEach(a => console.log(`  ${a.created_at}: ${JSON.stringify(a.payload).substring(0, 200)}`))
  } finally {
    await client.end()
  }
}

fixAuth().catch(console.error)
