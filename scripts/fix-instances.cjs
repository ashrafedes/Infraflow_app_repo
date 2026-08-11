const { Client } = require('pg')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

async function fixInstances() {
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
    // Check auth.instances columns
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'instances'
      ORDER BY ordinal_position
    `)
    console.log('auth.instances columns:')
    cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable}, default: ${c.column_default})`))

    // Create the default instance
    await client.query(`
      INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000',
        '{}'::jsonb,
        now(),
        now()
      )
      ON CONFLICT (id) DO NOTHING
    `)
    console.log('\nCreated default instance')

    // Verify
    const { rows: instances } = await client.query(`SELECT * FROM auth.instances`)
    console.log('Instances:', JSON.stringify(instances, null, 2))
  } finally {
    await client.end()
  }
}

fixInstances().catch(console.error)
