import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

// Load environment variables
try {
  dotenv.config()
} catch (error) {
  // Ignore dotenv errors
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function showMigrationInstructions() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('📋 Migration 003: Create account_reviews tables')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Get Supabase URL
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL not found in .env file\n')
    process.exit(1)
  }

  // Extract project ref
  const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!urlMatch) {
    console.error('❌ Invalid Supabase URL format\n')
    process.exit(1)
  }

  const projectRef = urlMatch[1]
  const backendDir = join(__dirname, '..')
  const migrationPath = join(backendDir, 'supabase', 'migrations', '003_create_account_reviews.sql')

  // Read migration file
  let migrationSQL
  try {
    migrationSQL = readFileSync(migrationPath, 'utf8')
  } catch (error) {
    console.error('❌ Could not read migration file:', migrationPath)
    process.exit(1)
  }

  console.log('✅ Migration file loaded\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Step-by-Step Instructions:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('1. Open your Supabase Dashboard:')
  console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}\n`)

  console.log('2. Navigate to SQL Editor:')
  console.log('   • Click "SQL Editor" in the left sidebar\n')

  console.log('3. Create a new query:')
  console.log('   • Click "New query" button\n')

  console.log('4. Copy the SQL below and paste it into the editor:\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SQL MIGRATION:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log(migrationSQL)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log('5. Execute the migration:')
  console.log('   • Click "Run" button (or press Ctrl+Enter)\n')

  console.log('6. Verify success:')
  console.log('   • Check for any errors in the results panel')
  console.log('   • Verify the account_reviews and account_review_posts tables exist in "Table Editor"\n')

  console.log('═══════════════════════════════════════════════════════════')
  console.log('💡 After running the migration, restart your backend server')
  console.log('═══════════════════════════════════════════════════════════\n')
}

showMigrationInstructions()

