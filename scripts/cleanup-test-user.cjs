const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function cleanupTestUser() {
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
    // Delete identities first
    const { rows } = await client.query(`
      DELETE FROM auth.identities
      WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'admin@infraflow.app')
      RETURNING user_id
    `)
    console.log('Deleted identities:', rows.length)

    // Delete user_profiles
    const { rows: profiles } = await client.query(`
      DELETE FROM user_profiles
      WHERE email = 'admin@infraflow.app'
      RETURNING id
    `)
    console.log('Deleted profiles:', profiles.length)

    // Delete auth user
    const { rows: users } = await client.query(`
      DELETE FROM auth.users
      WHERE email = 'admin@infraflow.app'
      RETURNING id
    `)
    console.log('Deleted auth users:', users.length)

  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await client.end()
  }
}

cleanupTestUser()
