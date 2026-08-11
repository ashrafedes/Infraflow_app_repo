const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function rerun005() {
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
    console.log('Connected')

    // Remove 005 from _migrations if it exists
    await client.query("DELETE FROM _migrations WHERE id = '005_fix_company_id_nullable.sql'")
    console.log('Cleared 005 from tracking')

    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '005_fix_company_id_nullable.sql'), 'utf8')
    console.log('Running 005...')
    await client.query(sql)
    console.log('Done!')
    
    await client.query("INSERT INTO _migrations (id) VALUES ('005_fix_company_id_nullable.sql')")
    console.log('Marked as applied')

    // Also create profile for existing user
    const { rows: users } = await client.query('SELECT id, email FROM auth.users')
    for (const u of users) {
      const { rows: existing } = await client.query('SELECT id FROM user_profiles WHERE id = $1', [u.id])
      if (existing.length === 0) {
        await client.query(`
          INSERT INTO user_profiles (id, email, full_name, company_id, role)
          VALUES ($1, $2, $3, NULL, 'company_admin')
          ON CONFLICT (id) DO NOTHING
        `, [u.id, u.email, u.email])
        console.log(`Created profile for: ${u.email}`)
      } else {
        console.log(`Profile already exists for: ${u.email}`)
      }
    }
  } catch (err) {
    console.error('Error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    if (err.hint) console.error('Hint:', err.hint)
  } finally {
    await client.end()
  }
}

rerun005()
