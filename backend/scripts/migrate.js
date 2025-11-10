// scripts/migrate.js
// scripts/migrate.js
// Unified migration runner: prints SQL for a given migration id or filename
import 'dotenv/config'
import { readdirSync, readFileSync } from 'fs'
import { execSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const arg = process.argv[2]
if (!arg) {
  console.error('❌ Usage: npm run migrate <id|name>')
  console.error('   Examples:')
  console.error('     npm run migrate 003')
  console.error('     npm run migrate 004_add_post_urls_and_comments.sql')
  process.exit(1)
}

const migrationsDir = join(__dirname, '..', 'supabase', 'migrations')

function resolveMigrationFile(input) {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))

  // Exact filename
  if (files.includes(input)) return input

  // By id prefix (e.g. 004 → 004_*.sql)
  const byId = files.find((f) => f.startsWith(`${input}_`) || f.startsWith(`${input}-`) || f.startsWith(`${input}`))
  if (byId) return byId

  // By substring match
  const byName = files.find((f) => f.toLowerCase().includes(input.toLowerCase()))
  if (byName) return byName

  return null
}

const fileName = resolveMigrationFile(arg)
if (!fileName) {
  console.error(`❌ Could not find migration matching "${arg}" in ${migrationsDir}`)
  process.exit(1)
}

const filePath = join(migrationsDir, fileName)
let sql
try {
  sql = readFileSync(filePath, 'utf8')
} catch (e) {
  console.error(`❌ Failed to read migration file: ${filePath}`)
  process.exit(1)
}

// If SUPABASE_DB_URL is provided, execute directly using psql (recommended, automated)
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (dbUrl) {
  try {
    console.log(`\n🔗 Executing migration ${fileName} against database (psql)...`)
    // Use spawnSync to correctly pipe SQL into psql on all platforms
    const args = ['-d', dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', '-']
    const res = spawnSync('psql', args, {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: process.env,
      shell: process.platform === 'win32', // allow resolution on Windows
    })
    if (res.status !== 0) {
      throw new Error(`psql exited with code ${res.status}`)
    }
    console.log('✅ Migration executed successfully via psql')
    process.exit(0)
  } catch (err) {
    console.error('❌ Failed executing migration via psql:', err.message)
    process.exit(1)
  }
}

const supabaseUrl = process.env.SUPABASE_URL
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL not found in .env')
  process.exit(1)
}

const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
if (!match) {
  console.error('❌ Invalid SUPABASE_URL format')
  process.exit(1)
}

const projectRef = match[1]

console.log('\n═══════════════════════════════════════════════════════════')
console.log(`📋 Migration: ${fileName}`)
console.log('═══════════════════════════════════════════════════════════\n')

console.log('1) Open your Supabase Dashboard:')
console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}\n`)

console.log('2) Navigate to SQL Editor → New query')
console.log('3) Copy and paste the SQL below, then Run:\n')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(sql)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

console.log('💡 Tip: Migrations are idempotent and safe to re-run in development.')
console.log('✅ Done.')
