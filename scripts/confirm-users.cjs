const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function confirmUsers() {
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
    
    // Check users and their confirmation status
    const { rows: users } = await client.query(`
      SELECT id, email, created_at, 
             raw_user_meta_data,
             email_confirmed_at
      FROM auth.users
      ORDER BY created_at
    `)
    console.log('Users:')
    users.forEach(u => {
      console.log(`  ${u.email} - confirmed: ${u.email_confirmed_at ? 'yes' : 'NO'} - id: ${u.id}`)
    })

    // Confirm all unconfirmed users
    for (const u of users) {
      if (!u.email_confirmed_at) {
        await client.query(`
          UPDATE auth.users 
          SET email_confirmed_at = now(), 
              confirmed_at = now(),
              raw_app_meta_data = raw_app_meta_data || '{"provider":"email","providers":["email"]}'::jsonb
          WHERE id = $1
        `, [u.id])
        console.log(`Confirmed: ${u.email}`)
      }
    }

    console.log('Done!')
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
  } finally {
    await client.end()
  }
}

confirmUsers()
