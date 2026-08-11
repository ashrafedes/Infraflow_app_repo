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
    
    // Check user_profiles
    const { rows: profiles } = await client.query('SELECT id, email, company_id, role FROM user_profiles')
    console.log('Profiles:', profiles)

    // Check companies
    const { rows: companies } = await client.query('SELECT id, name FROM companies')
    console.log('Companies:', companies)

    // Check if company_id function works - it uses SECURITY DEFINER so it should
    // But the issue is: the function owner is 'postgres' (pooler user), and 
    // user_profiles has RLS. SECURITY DEFINER bypasses RLS for the function owner.
    // But wait - the pooler 'postgres' user is NOT the table owner 'postgres'.
    // Actually in Supabase pooler, the user is 'postgres.smhckogpgkdppdvranqh' 
    // which maps to the 'postgres' role in the database. So it should work.
    
    // The real issue might be that the function was created by the pooler user
    // which is different from the table owner. Let me check.
    
    const { rows: funcInfo } = await client.query(`
      SELECT p.proname, pg_catalog.pg_get_userbyid(p.proowner) as owner,
             p.prosecdef as security_definer
      FROM pg_proc p
      WHERE p.proname IN ('company_id', 'user_role')
    `)
    console.log('Functions:', funcInfo)

    // The issue is likely that the SECURITY DEFINER function runs as 'postgres'
    // but 'postgres' is subject to RLS too (unless RELFORCEROWSECURITY is false)
    // Let's check
    
    const { rows: rlsInfo } = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity 
      FROM pg_class WHERE relname = 'user_profiles'
    `)
    console.log('RLS info:', rlsInfo[0])

    // If relforcerowsecurity is false, the table owner (postgres) bypasses RLS
    // So SECURITY DEFINER running as postgres should work.
    
    // But wait - the function might not be able to see the user's row because
    // auth.uid() returns the authenticated user's ID, and the function queries
    // user_profiles WHERE id = auth.uid(). If the function runs as postgres
    // (bypassing RLS), it should see all rows.
    
    // Let me test: simulate what happens when an authenticated user calls company_id()
    // We can't easily test this from the pooler connection, but let me check
    // if the function actually returns the right value.
    
    // Actually, the problem might be simpler: the projects_insert policy checks
    // company_id = public.company_id(), but the INSERT provides a company_id
    // value. Let me check what the frontend sends.
    
    console.log('\nChecking if company_id() returns NULL for pooler connection...')
    const { rows: testResult } = await client.query('SELECT public.company_id() as result')
    console.log('company_id() from pooler:', testResult[0])
    
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

check()
