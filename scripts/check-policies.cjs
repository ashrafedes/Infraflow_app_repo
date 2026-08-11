const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function check() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  try {
    await client.connect()
    
    // Check table owner
    const { rows: tables } = await client.query(`
      SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_profiles'
    `)
    console.log('user_profiles owner:', tables[0])

    // Check grants on user_profiles
    const { rows: grants } = await client.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE table_name = 'user_profiles' AND table_schema = 'public'
      ORDER BY grantee, privilege_type
    `)
    console.log('user_profiles grants:', grants)

    // Check grants on companies
    const { rows: companyGrants } = await client.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE table_name = 'companies' AND table_schema = 'public'
      ORDER BY grantee, privilege_type
    `)
    console.log('companies grants:', companyGrants)

    // Check the current user
    const { rows: currentUser } = await client.query('SELECT current_user, current_setting(\'role\') as role')
    console.log('Current user:', currentUser[0])

  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

check()
