const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function checkTriggers() {
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
    // Check triggers on auth.users
    const { rows: triggers } = await client.query(`
      SELECT tgname, tgtype, tgenabled, pg_get_triggerdef(oid) as definition
      FROM pg_trigger
      WHERE tgrelid = 'auth.users'::regclass
      ORDER BY tgname
    `)
    console.log('Triggers on auth.users:')
    triggers.forEach(t => console.log(`  ${t.tgname}: ${t.definition}`))

    // Try to manually test the handle_new_user function
    const { rows: test } = await client.query(`
      SELECT public.handle_new_user() as test
    `).catch(e => [{ test: 'ERROR: ' + e.message }])
    console.log('\nhandle_new_user test:', test[0].test)

    // Check if the function exists and is valid
    const { rows: funcs } = await client.query(`
      SELECT proname, prosrc, pg_get_function_arguments(oid) as args
      FROM pg_proc
      WHERE proname = 'handle_new_user'
    `)
    console.log('\nhandle_new_user function:', JSON.stringify(funcs[0], null, 2))

    // Check for any broken functions
    const { rows: broken } = await client.query(`
      SELECT proname, pg_get_function_arguments(oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND prosrc LIKE '%error%'
      LIMIT 5
    `)
    console.log('\nPotentially broken functions:', broken.length)

    // Check the auth schema version
    const { rows: version } = await client.query(`
      SELECT version FROM auth.schema_migrations ORDER BY version DESC LIMIT 1
    `)
    console.log('\nAuth schema version:', version[0]?.version)
  } finally {
    await client.end()
  }
}

checkTriggers().catch(console.error)
