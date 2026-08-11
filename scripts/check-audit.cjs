const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function checkAuditLog() {
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
    // Check recent audit log entries
    const { rows: audit } = await client.query(`
      SELECT created_at, payload
      FROM auth.audit_log_entries
      ORDER BY created_at DESC
      LIMIT 10
    `)
    console.log('Recent audit entries:')
    audit.forEach(a => {
      const ts = a.created_at
      const payload = typeof a.payload === 'string' ? a.payload : JSON.stringify(a.payload)
      console.log(`  ${ts}: ${payload.substring(0, 300)}`)
    })

    // Check if there are any other users that exist
    const { rows: users } = await client.query(`
      SELECT id, email, email_confirmed_at, created_at
      FROM auth.users
      ORDER BY created_at DESC
      LIMIT 5
    `)
    console.log('\nAll users:')
    users.forEach(u => console.log(`  ${u.email} (confirmed: ${u.email_confirmed_at ? 'yes' : 'no'}, created: ${u.created_at})`))

    // Check if the auth schema has any broken functions
    const { rows: funcStatus } = await client.query(`
      SELECT p.proname, n.nspname,
             pg_get_functiondef(p.oid) as def
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'auth'
      AND p.proname LIKE '%user%'
      ORDER BY p.proname
    `)
    console.log('\nAuth functions with "user" in name:')
    funcStatus.forEach(f => console.log(`  ${f.nspname}.${f.proname}`))

    // Try to manually simulate what GoTrue does during login
    // GoTrue queries: SELECT * FROM auth.users WHERE email = $1
    const { rows: testQuery } = await client.query(`
      SELECT id, email, encrypted_password, aud, role,
             email_confirmed_at, banned_until, deleted_at,
             raw_app_meta_data, raw_user_meta_data
      FROM auth.users
      WHERE email = 'admin@infraflow.app'
    `)
    console.log('\nGoTrue login query result:', JSON.stringify(testQuery[0], null, 2))

    // Check if the password verification works
    const { rows: pwCheck } = await client.query(`
      SELECT encrypted_password = crypt('Test1234!', encrypted_password) as password_matches
      FROM auth.users
      WHERE email = 'admin@infraflow.app'
    `)
    console.log('\nPassword matches:', pwCheck[0]?.password_matches)
  } finally {
    await client.end()
  }
}

checkAuditLog().catch(console.error)
