const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function checkInstances() {
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
    // Check auth.instances
    const { rows: instances } = await client.query(`SELECT * FROM auth.instances`)
    console.log('Auth instances:', JSON.stringify(instances, null, 2))

    // Check if the user's instance_id matches
    const { rows: user } = await client.query(`
      SELECT id, instance_id FROM auth.users WHERE email = 'admin@infraflow.app'
    `)
    console.log('\nUser instance_id:', user[0]?.instance_id)

    // Check the other user
    const { rows: user2 } = await client.query(`
      SELECT id, instance_id, email FROM auth.users WHERE email = 'ashrafede@gmail.com'
    `)
    console.log('Other user instance_id:', user2[0]?.instance_id)

    // Try updating our user's instance_id to match the other user's
    if (user2[0]?.instance_id && user[0]?.instance_id !== user2[0]?.instance_id) {
      await client.query(`
        UPDATE auth.users SET instance_id = $1 WHERE email = 'admin@infraflow.app'
      `, [user2[0].instance_id])
      console.log('\nUpdated instance_id to match:', user2[0].instance_id)
    }

    // Check if there are any RLS policies on auth.users that might block GoTrue
    const { rows: policies } = await client.query(`
      SELECT polname, polcmd, polqual, polwithcheck
      FROM pg_policy
      WHERE polrelid = 'auth.users'::regclass
    `)
    console.log('\nRLS policies on auth.users:', policies.length)
    policies.forEach(p => console.log(`  ${p.polname} (${p.polcmd})`))

    // Check if RLS is enabled on auth.users
    const { rows: rls } = await client.query(`
      SELECT relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE oid = 'auth.users'::regclass
    `)
    console.log('\nRLS on auth.users:', JSON.stringify(rls[0], null, 2))
  } finally {
    await client.end()
  }
}

checkInstances().catch(console.error)
