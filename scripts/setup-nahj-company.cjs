const { Client } = require('pg')
const crypto = require('crypto')

const DB_PASSWORD = 'Wali2061ero$'
const PROJECT_REF = 'smhckogpgkdppdvranqh'

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: `postgres.${PROJECT_REF}`,
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
})

// ============================================================================
// DATA
// ============================================================================

const COMPANY_NAME = 'شركة نهج التقدم'
const USER_EMAIL = 'alaa@nahj.com'
const USER_PASSWORD = '123456789'
const USER_FULL_NAME = 'Alaa'

// Materials: [item_number, long_description, category_name]
const MATERIALS = [
  ['10004', 'Warning Tape FOC, Detectable, DAWIYAT, 300mtrs/roll, Orange', 'Civil'],
  ['20032', 'End Cap 20mm, Rubber with Ring', 'Civil'],
  ['20033', 'End Cap 12mm, Rubber with Ring', 'Civil'],
  ['20004', '1x 2way 12/8mm HDPE PE100 PN10 mutiple ducts', 'Civil'],
  ['20006', '1x 4way flat 20/16mm HDPE PE100 PN16 duct bundle', 'Civil'],
  ['30007', 'Handhole, 2 Cover (LxWxH) (155 cm x 100 cm x 95 cm)', 'Civil'],
  ['30004', 'Marking plate with Dawiyat codification', 'Civil'],
  ['50009', 'Optical Distribution Box (ODB) (4 ports with 1:4 Splitter)', 'Fiber'],
  ['50010', 'Optical Distribution Box (ODB) (12 ports with 2x1:4 Splitter)', 'Fiber'],
  ['50014', 'Optical Distribution Box (ODB) (20 ports with 1:16 Splitter)', 'Fiber'],
  ['50016', 'Optical Distribution Box (ODB) (36 ports with 2x2:16 Splitter)', 'Fiber'],
  ['50019', '144, 24 FAT Closure', 'Fiber'],
  ['50025', '1 - 2:4 Splitter in FDT/FAT', 'Fiber'],
  ['60004', 'Fiber Optic Cable, SM,(Micro-Central tube-Duct), 12 Fiber', 'Fiber'],
  ['60005', 'Fiber Optic Cable, SM,(Micro Duct),144 Fiber', 'Fiber'],
  ['20019-T', 'Cable Tie 280 x 7.6mm (100Pcs/Pkt)', 'Civil'],
  ['20021-T', 'Cable Tie 530 x 7.6mm (100Pcs/Pkt)', 'Civil'],
  ['30002', '2m Galvanized Steel Pipe (50 mm OD) with minimum wall thickness of 4mm and 60 micron of galvanizing and 2 clamps with PVC coated galvanized conduit endpoint', 'Civil'],
  ['50027', '1 - 2:16 Splitter in FDT/FAT', 'Fiber'],
  ['60001', 'Fiber Optic Cable, SM,(Central tube-Duct), 12 Fiber', 'Fiber'],
  ['70001', 'FAT Closure QR code Sticker', 'Fiber'],
  ['60006', 'Fiber Optic Cable, SM,(Micro Duct),288 Fiber', 'Fiber'],
  ['70002', 'Patch cord 10m', 'Fiber'],
  ['70003', 'Patch cord 5m', 'Fiber'],
  ['50006', '288 ports Optical Distribution Frame (ODF)', 'Fiber'],
  ['50023', '288 Fiber Closure', 'Fiber'],
  ['30005', 'Mini-Manhole, (LxWxH) (155 cm x 155 cm x 199 cm)', 'Civil'],
  ['20019', '1x 2 Way Spacer 12mm (DAWIYAT) (Cable Tie 280x7.6mm(100pcs/Pkt)', 'Civil'],
  ['50022', '144 Fiber Closure', 'Fiber'],
  ['50019-1', '144, FAT TRAY', 'Fiber'],
  ['20021', '1x 4 Way flat Spacer 20mm (DAWIYAT)(Cable Tie 530x7.6mm(100pcs/Pkt)', 'Civil'],
  ['50002', 'ETIS rack with cable management (2200x900x300) (HxWxD)', 'Fiber'],
  ['50019-4', 'SYNO D25 Entry Kit 2x7-14mm', 'Fiber'],
  ['50005', '144 ports Optical Distribution Frame (ODF)', 'Fiber'],
  ['50019-5', '12 Fiber Cable Entry Holder (Drop Inlet Closing Piller)', 'Fiber'],
  ['50019-6', '12 Fiber Cable Holding Clamp (Cable Holder SS for FAT)', 'Fiber'],
  ['50017', 'Optical Distribution Box (ODB) (36 ports with 2:32 Splitter)', 'Fiber'],
  ['50019-2', 'SCM splice tray-Splitter SE bk', 'Fiber'],
  ['50019-3', 'SYNO D25 Entry Kit 8x5-6mm', 'Fiber'],
]

// Work Orders: [wo_number, site_code, work_location_name, class, subclass]
const WORK_ORDERS = [
  ['2605OSPCI0002188', 'HFF-HJER-DBAB-08', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001159', 'HFF-HJER-DBAB-08', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002194', 'HFF-HJER-OHOD-05', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPCI0002201', 'HFF-ALMU-NAKH-02', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001172', 'HFF-ALMU-NAKH-02', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002202', 'HFF-ALMU-NAKH-08', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001173', 'HFF-ALMU-NAKH-08', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002203', 'HFF-ALMU-NAKH-17', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001174', 'HFF-ALMU-NAKH-17', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002204', 'HFF-ALMU-SAHA-03', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001175', 'HFF-ALMU-SAHA-03', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPFI0001176', 'HFF-ALMU-ZAHR-01', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPFI0001177', 'HFF-ALMU-ZAHR-03', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002207', 'HFF-ALMU-ZAHR-10', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001178', 'HFF-ALMU-ZAHR-10', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002208', 'HFF-ALMU-ZAHR-11', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001179', 'HFF-ALMU-ZAHR-11', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0002209', 'HFF-ALMU-ZAHR-12', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0001180', 'HFF-ALMU-ZAHR-12', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000788', 'HFF-HJER-DBAB-09', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000859', 'HFF-HJER-DBAB-09', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000789', 'HFF-HJER-DBAB-12', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000860', 'HFF-HJER-DBAB-12', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000734', 'HFF-ALMU-NAKH-09', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000794', 'HFF-ALMU-NAKH-09', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000735', 'HFF-ALMU-NAKH-14', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000795', 'HFF-ALMU-NAKH-14', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000736', 'HFF-ALMU-NAKH-15', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000796', 'HFF-ALMU-NAKH-15', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000737', 'HFF-ALMU-NAKH-16', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000797', 'HFF-ALMU-NAKH-16', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000738', 'HFF-ALMU-NAKH-18', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000798', 'HFF-ALMU-NAKH-18', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000739', 'HFF-ALMU-NAKH-19', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000799', 'HFF-ALMU-NAKH-19', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000740', 'HFF-ALMU-NAKH-F1', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000800', 'HFF-ALMU-NAKH-F1', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPFI0000802', 'HFF-ALMU-SAHA-F1', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000742', 'HFF-ALMU-SAHA-10', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000803', 'HFF-ALMU-SAHA-10', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000743', 'HFF-ALMU-ZAHR-07', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000804', 'HFF-ALMU-ZAHR-07', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPFI0000806', 'HFF-ALMU-ZAHR-F1', 'HOFUF', 'OSP', 'Fiber'],
  ['2605OSPCI0000008', 'HFF-HJER-DBAB-07', 'HOFUF', 'OSP', 'Civil'],
  ['2605OSPFI0000008', 'HFF-HJER-DBAB-07', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0003243', 'HFF-HJER-DBAB-05', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPFI0003274', 'HFF-HJER-DBAB-05', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0003248', 'HFF-HJER-DBAB-01', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPFI0003280', 'HFF-HJER-DBAB-01', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0003249', 'HFF-HJER-DBAB-02', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPFI0003281', 'HFF-HJER-DBAB-02', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0003252', 'HFF-HJER-DBAB-F1', 'HOFUF', 'OSP', 'Civil'],
  ['2501OSPFI0002552', 'RIY-8764-NABI-01', 'BADIA SHUMALI', 'OSP', 'Fiber'],
  ['2501OSPFI0002553', 'RIY-8764-BAJA-01', 'BADIA SHUMALI', 'OSP', 'Fiber'],
  ['2505OSPFI0003038', 'HFF-ALMU-SAHA-01', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPFI0003039', 'HFF-ALMU-NAKH-04', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0003024', 'HFF-ALMU-SAHA-01', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPCI0003025', 'HFF-ALMU-NAKH-04', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPFI0002884', 'HFF-ALMU-NAKH-05', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0002882', 'HFF-ALMU-NAKH-05', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPFI0002883', 'HFF-ALMU-NAKH-03', 'HOFUF', 'OSP', 'Fiber'],
  ['2505OSPCI0002881', 'HFF-ALMU-NAKH-03', 'HOFUF', 'OSP', 'Civil'],
  ['2505OSPFI0002620', 'QTF-QTF2-TARO-05', 'QATIF', 'OSP', 'Fiber'],
  ['2505OSPFI0002619', 'QTF-QTF2-TARO-04', 'QATIF', 'OSP', 'Fiber'],
  ['2505OSPFI0002618', 'QTF-QTF2-TARO-03', 'QATIF', 'OSP', 'Fiber'],
  ['2505OSPFI0002617', 'QTF-QTF2-TARO-02', 'QATIF', 'OSP', 'Fiber'],
  ['2505OSPFI0002616', 'QTF-QTF2-TARO-01', 'QATIF', 'OSP', 'Fiber'],
  ['2405OSPCI0000554', 'ARR-ARAR::ARR-SEWH:01', 'ARAR', 'OSP', 'Civil'],
  ['2501OSPFI0002391', 'RIY-8764-MARW-01', 'BADIA SHUMALI', 'OSP', 'Fiber'],
  ['2501OSPFI0001044', 'RIY-8764-BADI-01', 'BADIA SHUMALI', 'OSP', 'Fiber'],
  ['2409OSPFI0000576', 'ARR-ARAR::ARR-SEWH:01', 'ARAR', 'OSP', 'Fiber'],
  ['2409OSPCI0000511', 'ARR-ARAR::ARR-SEWH:02', 'ARAR', 'OSP', 'Civil'],
  ['2405OSPCI0000512', 'RAF-RHFB::RAF-SEWH:01', 'RAFHA', 'OSP', 'Civil'],
  ['2409OSPFI0000533', 'ARR-ARAR::ARR-SEWH:02', 'ARAR', 'OSP', 'Fiber'],
  ['2405OSPFI0000534', 'RAF-RHFB::RAF-SEWH:01', 'RAFHA', 'OSP', 'Fiber'],
]

async function main() {
  await client.connect()
  console.log('Connected to database\n')

  // ==========================================================================
  // 1. Apply migration: add class/subclass columns
  // ==========================================================================
  console.log('1. Adding class/subclass columns to work_orders...')
  await client.query(`
    ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS class TEXT NULL,
      ADD COLUMN IF NOT EXISTS subclass TEXT NULL
  `)
  console.log('   Done.\n')

  // ==========================================================================
  // 2. Create company
  // ==========================================================================
  console.log(`2. Creating company "${COMPANY_NAME}"...`)
  let companyId
  const { rows: existingCompany } = await client.query(
    'SELECT id FROM companies WHERE name = $1', [COMPANY_NAME]
  )
  if (existingCompany.length > 0) {
    companyId = existingCompany[0].id
    console.log(`   Company already exists: ${companyId}`)
  } else {
    const { rows } = await client.query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id', [COMPANY_NAME]
    )
    companyId = rows[0].id
    console.log(`   Created company: ${companyId}`)
  }

  // Create subscription for the company (free trial)
  const { rows: planRows } = await client.query(
    "SELECT id FROM subscription_plans WHERE plan_code = 'free_trial' LIMIT 1"
  )
  if (planRows.length > 0) {
    const planId = planRows[0].id
    const { rows: existingSub } = await client.query(
      'SELECT id FROM subscriptions WHERE company_id = $1', [companyId]
    )
    if (existingSub.length === 0) {
      await client.query(`
        INSERT INTO subscriptions (company_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start)
        VALUES ($1, $2, 'trial', now(), now() + interval '30 days', now())
      `, [companyId, planId])
      console.log('   Created subscription (free trial, 30 days)')
    } else {
      console.log('   Subscription already exists')
    }
  } else {
    console.log('   WARNING: free_trial plan not found, skipping subscription')
  }

  // ==========================================================================
  // 3. Create user (auth.users + identities + user_profiles)
  // ==========================================================================
  console.log(`3. Creating user "${USER_EMAIL}"...`)
  const { rows: existingUser } = await client.query(
    'SELECT id FROM auth.users WHERE email = $1 AND deleted_at IS NULL', [USER_EMAIL]
  )
  let userId
  if (existingUser.length > 0) {
    userId = existingUser[0].id
    console.log(`   User already exists: ${userId}`)
    // Ensure profile is linked to the company
    await client.query(`
      INSERT INTO user_profiles (id, company_id, full_name, email, role, is_active)
      VALUES ($1, $2, $3, $4, 'company_admin', true)
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active
    `, [userId, companyId, USER_FULL_NAME, USER_EMAIL])
    console.log('   Updated user profile')
  } else {
    userId = crypto.randomUUID()
    await client.query(`
      INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        phone, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change_token_new,
        email_change, phone_change, phone_change_token,
        email_change_token_current, email_change_confirm_status,
        reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        $1::uuid,
        'authenticated',
        'authenticated',
        $2,
        crypt($3, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('sub', $1::text, 'email', $2, 'full_name', $4, 'email_verified', true, 'phone_verified', false),
        now(), now(),
        NULL, false, false,
        '', '', '',
        '', '', '',
        '', 0,
        ''
      )
    `, [userId, USER_EMAIL, USER_PASSWORD, USER_FULL_NAME])

    await client.query(`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        $1::text,
        $1::uuid,
        jsonb_build_object('sub', $1::text, 'email', $2, 'full_name', $3, 'email_verified', true, 'phone_verified', false),
        'email',
        now(), now(), now()
      )
    `, [userId, USER_EMAIL, USER_FULL_NAME])

    await client.query(`
      INSERT INTO user_profiles (id, company_id, full_name, email, role, is_active)
      VALUES ($1, $2, $3, $4, 'company_admin', true)
      ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active
    `, [userId, companyId, USER_FULL_NAME, USER_EMAIL])
    console.log(`   Created user: ${userId}`)
  }

  // ==========================================================================
  // 4. Create material categories + materials
  // ==========================================================================
  console.log('4. Creating material categories and materials...')
  const categoryMap = {} // name -> id
  for (const catName of ['Civil', 'Fiber']) {
    const { rows } = await client.query(`
      INSERT INTO material_categories (company_id, name)
      VALUES ($1, $2)
      ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [companyId, catName])
    categoryMap[catName] = rows[0].id
    console.log(`   Category: ${catName} → ${rows[0].id}`)
  }

  let matCount = 0
  for (const [itemNumber, longDesc, catName] of MATERIALS) {
    const shortDesc = longDesc.length > 60 ? longDesc.substring(0, 57) + '...' : longDesc
    const catId = categoryMap[catName]
    await client.query(`
      INSERT INTO materials (company_id, item_number, short_description, long_description, category_id, uom, is_active)
      VALUES ($1, $2, $3, $4, $5, 'pcs', true)
      ON CONFLICT (company_id, item_number) DO UPDATE SET
        short_description = EXCLUDED.short_description,
        long_description = EXCLUDED.long_description,
        category_id = EXCLUDED.category_id
    `, [companyId, itemNumber, shortDesc, longDesc, catId])
    matCount++
  }
  console.log(`   Created/updated ${matCount} materials`)

  // ==========================================================================
  // 5. Create project DAWAYAT
  // ==========================================================================
  console.log('5. Creating project DAWAYAT...')
  const { rows: projRows } = await client.query(`
    INSERT INTO projects (company_id, code, name, is_active)
    VALUES ($1, 'DAWAYAT', 'DAWAYAT', true)
    ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [companyId])
  const projectId = projRows[0].id
  console.log(`   Project: ${projectId}`)

  // ==========================================================================
  // 6. Create work locations
  // ==========================================================================
  console.log('6. Creating work locations...')
  const locMap = {} // name -> id
  const locNames = [...new Set(WORK_ORDERS.map((w) => w[2]))]
  for (const locName of locNames) {
    const locCode = locName.toUpperCase().replace(/\s+/g, '_')
    const { rows } = await client.query(`
      INSERT INTO work_locations (company_id, code, name, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [companyId, locCode, locName])
    locMap[locName] = rows[0].id
    console.log(`   Location: ${locName} → ${rows[0].id}`)
  }

  // ==========================================================================
  // 7. Create work orders with class/subclass
  // ==========================================================================
  console.log('7. Creating work orders...')
  let woCount = 0
  for (const [woNumber, siteCode, locName, cls, subclass] of WORK_ORDERS) {
    const locId = locMap[locName]
    await client.query(`
      INSERT INTO work_orders (company_id, work_order_number, site_code, project_id, work_location_id, supervisor, status, class, subclass)
      VALUES ($1, $2, $3, $4, $5, 'Alaa', 'active', $6, $7)
      ON CONFLICT (company_id, work_order_number) DO UPDATE SET
        site_code = EXCLUDED.site_code,
        project_id = EXCLUDED.project_id,
        work_location_id = EXCLUDED.work_location_id,
        class = EXCLUDED.class,
        subclass = EXCLUDED.subclass
    `, [companyId, woNumber, siteCode, projectId, locId, cls, subclass])
    woCount++
  }
  console.log(`   Created/updated ${woCount} work orders`)

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n=== SUMMARY ===')
  console.log(`Company: ${COMPANY_NAME} (${companyId})`)
  console.log(`User: ${USER_EMAIL} (${userId})`)
  console.log(`Materials: ${matCount}`)
  console.log(`Project: DAWAYAT (${projectId})`)
  console.log(`Work Locations: ${locNames.length}`)
  console.log(`Work Orders: ${woCount}`)
  console.log('\nDone! You can now log in with:')
  console.log(`  Email: ${USER_EMAIL}`)
  console.log(`  Password: ${USER_PASSWORD}`)

  await client.end()
}

main().catch((err) => {
  console.error('ERROR:', err)
  process.exit(1)
})
