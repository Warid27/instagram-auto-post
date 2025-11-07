import { readFileSync, existsSync, renameSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables (with error handling for encoding issues)
try {
  dotenv.config();
} catch (error) {
  console.warn('⚠️  Warning: Could not parse .env file with dotenv');
  console.warn('   This might be due to encoding issues. Supabase CLI will try to parse it directly.\n');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  console.log('\n🚀 Running Supabase Migration\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get paths first
  const backendDir = join(__dirname, '..');

  // Check for .env BOM issue first
  const envPath = join(backendDir, '.env');
  if (existsSync(envPath)) {
    try {
      const fileBuffer = readFileSync(envPath);
      const hasBOM = fileBuffer[0] === 0xEF && fileBuffer[1] === 0xBB && fileBuffer[2] === 0xBF;
      if (hasBOM) {
        console.error('❌ .env file has BOM (Byte Order Mark) which will cause Supabase CLI to fail!');
        console.error('\n💡 Fix it by running:');
        console.error('   npm run fix-env\n');
        console.error('   OR manually:');
        console.error('   1. Open .env in a text editor');
        console.error('   2. Save as UTF-8 without BOM\n');
        process.exit(1);
      }
    } catch (e) {
      // Ignore check errors, continue
    }
  }

  // Check Supabase configuration
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase configuration!');
    console.error('   Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file.\n');
    process.exit(1);
  }

  console.log('✅ Supabase configuration found');
  console.log(`   URL: ${supabaseUrl}\n`);

  // Get paths
  const migrationPath = join(backendDir, 'supabase', 'migrations', '001_initial_schema.sql');
  const supabaseCliPath = join(backendDir, 'node_modules', 'supabase', 'bin', 'supabase.exe');

  // Check if migration file exists
  if (!existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath);
    process.exit(1);
  }

  // Check if Supabase CLI exists
  if (!existsSync(supabaseCliPath)) {
    console.error('❌ Supabase CLI not found in node_modules');
    console.error('   Please run: npm install\n');
    process.exit(1);
  }

  console.log('✅ Migration file found:', migrationPath);
  console.log('✅ Supabase CLI found:', supabaseCliPath);
  console.log('\n📊 Executing migration...\n');

  try {
    // Extract project ref from Supabase URL
    // URL format: https://[project-ref].supabase.co
    const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (!urlMatch) {
      console.error('❌ Invalid Supabase URL format');
      console.error('   Expected format: https://[project-ref].supabase.co');
      process.exit(1);
    }

    const projectRef = urlMatch[1];
    console.log(`📌 Detected project ref: ${projectRef}\n`);

    // Validate project ref format (should be 20 alphanumeric characters)
    if (!/^[a-z0-9]{20}$/.test(projectRef)) {
      console.error('❌ Invalid project ref format detected from URL');
      console.error(`   Found: ${projectRef}`);
      console.error('   Expected format: 20 lowercase alphanumeric characters (e.g., dxdnobjjveqowzdnfojd)\n');
      console.log('💡 Please check your SUPABASE_URL in .env file');
      console.log('   Format should be: https://[project-ref].supabase.co\n');
      process.exit(1);
    }

    // Check if Supabase is initialized (has config.toml)
    const configPath = join(backendDir, 'supabase', 'config.toml');
    const isInitialized = existsSync(configPath);

    if (!isInitialized) {
      console.log('⚠️  Supabase not initialized. Initializing...\n');
      
      try {
        // Initialize Supabase (this creates config.toml)
        execSync(`npx supabase init`, {
          cwd: backendDir,
          stdio: 'inherit'
        });
        console.log('\n✅ Supabase initialized!\n');
      } catch (initError) {
        console.error('\n❌ Failed to initialize Supabase.');
        console.log('\n📋 Please initialize manually:\n');
        console.log(`   Run: npx supabase init`);
        console.log(`   Then run: npm run migrate again\n`);
        process.exit(1);
      }
    }

    // Check if project is linked by reading config.toml
    // A linked project will have a [project] section with project_id matching our project ref
    let isLinked = false;
    if (isInitialized) {
      try {
        const configContent = readFileSync(configPath, 'utf8');
        // Check if config has the project_id matching our project ref
        // Linked projects have: project_id = "dxdnobjjveqowzdnfojd" (the actual project ref)
        // Unlinked projects have: project_id = "backend" (just a local identifier)
        const projectIdMatch = configContent.match(/project_id\s*=\s*"([^"]+)"/);
        if (projectIdMatch) {
          const configProjectId = projectIdMatch[1];
          // If it matches our project ref format (20 chars), it's linked
          isLinked = /^[a-z0-9]{20}$/.test(configProjectId) && configProjectId === projectRef;
        }
      } catch (e) {
        // Config file exists but can't read it, assume not linked
        isLinked = false;
      }
    }

    if (!isLinked) {
      console.log('⚠️  Project is not linked to Supabase CLI.\n');
      console.log('📋 Linking project to Supabase CLI...\n');
      console.log('   This will require you to:');
      console.log('   1. Login to Supabase (if not already logged in)');
      console.log('   2. Link your project\n');
      
      try {
        // First check if user is logged in (with timeout)
        try {
          execSync(`npx supabase projects list`, {
            cwd: backendDir,
            stdio: 'pipe',
            timeout: 15000, // 15 second timeout
            env: { ...process.env }
          });
        } catch (loginError) {
          if (loginError.signal === 'SIGTERM' || loginError.code === 'TIMEOUT') {
            console.log('\n⚠️  Login check timed out. Skipping login check...\n');
          } else {
            console.log('⚠️  Not logged in. Please login first:\n');
            console.log(`   Run: npx supabase login\n`);
            console.log('   Then run: npm run migrate again\n');
            process.exit(1);
          }
        }

        // Link the project (with timeout)
        // Note: Supabase CLI might have issues with .env encoding
        // We'll run it and catch any .env parsing errors
        console.log('🔄 Linking project...\n');
        console.log('   (This may take 30-60 seconds, please wait...)\n');
        try {
          execSync(`npx supabase link --project-ref ${projectRef}`, {
            cwd: backendDir,
            stdio: 'inherit',
            timeout: 120000, // 2 minute timeout for linking
            env: { ...process.env }
          });
        } catch (linkExecError) {
          // Check for timeout
          if (linkExecError.signal === 'SIGTERM' || linkExecError.code === 'TIMEOUT') {
            console.error('\n❌ Linking timed out after 2 minutes.');
            console.error('   The Supabase CLI may be slow or having connection issues.\n');
            console.log('💡 Alternative: Link manually and then run migration:\n');
            console.log(`   1. Run: npx supabase link --project-ref ${projectRef}`);
            console.log('   2. Wait for it to complete (may take a few minutes)');
            console.log('   3. Then run: npm run migrate\n');
            console.log('   OR use the Dashboard method (faster):\n');
            console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef);
            console.log('   2. Navigate to SQL Editor');
            console.log('   3. Copy and paste the migration file');
            console.log('   4. Click Run\n');
            process.exit(1);
          }
          // Check if it's an .env parsing error
          if (linkExecError.message && linkExecError.message.includes('parse environment file')) {
            console.error('\n❌ Supabase CLI failed to parse .env file');
            console.error('   This is usually due to encoding issues (BOM or special characters)\n');
            console.log('💡 Solutions:');
            console.log('   1. Open your .env file in a text editor');
            console.log('   2. Save it as UTF-8 without BOM');
            console.log('   3. Make sure there are no special characters in variable names');
            console.log('   4. Or temporarily rename .env to .env.backup and create a clean one\n');
            console.log('   Then run: npm run migrate again\n');
            process.exit(1);
          }
          throw linkExecError;
        }

        console.log('\n✅ Project linked successfully!\n');
        
      } catch (linkError) {
        console.error('\n❌ Failed to link project automatically.');
        
        // Check for specific error types
        if (linkError.message && linkError.message.includes('parse environment file')) {
          console.error('\n   Error: Supabase CLI cannot parse .env file');
          console.error('   This is usually due to encoding issues (BOM character)\n');
          console.log('💡 Fix the .env file encoding issue first, then try again.\n');
        } else if (linkError.message && linkError.message.includes('Invalid project ref')) {
          console.error(`\n   Error: Invalid project ref format`);
          console.error(`   Make sure you're using the correct 20-character project ref\n`);
        }
        
        console.log('\n📋 Please link manually:\n');
        console.log(`   1. Run: npx supabase login`);
        console.log(`   2. Run: npx supabase link --project-ref ${projectRef}`);
        console.log(`   3. Then run: npm run migrate\n`);
        process.exit(1);
      }
    } else {
      console.log('✅ Project is already linked\n');
    }

    // Now push the migration
    console.log('🔄 Pushing migration to Supabase...\n');
    console.log('   (This may take 1-2 minutes, please wait...)\n');
    
    try {
      // Use npx to run supabase CLI (more reliable on Windows)
      execSync(`npx supabase db push`, {
        cwd: backendDir,
        stdio: 'inherit',
        timeout: 180000, // 3 minute timeout for migration push
        env: {
          ...process.env,
        }
      });

      console.log('\n✅ Migration completed successfully!\n');
      
    } catch (pushError) {
      // Check for timeout
      if (pushError.signal === 'SIGTERM' || pushError.code === 'TIMEOUT') {
        console.error('\n❌ Migration push timed out after 3 minutes.');
        console.error('   The migration may be too large or Supabase CLI is slow.\n');
      } else {
        console.error('\n❌ Failed to push migration.');
      }
      
      console.log('\n💡 Faster Alternative: Execute SQL directly via Dashboard\n');
      console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef);
      console.log('   2. Navigate to SQL Editor');
      console.log('   3. Click "New query"');
      console.log('   4. Copy and paste the contents of:');
      console.log(`      ${migrationPath}`);
      console.log('   5. Click "Run" (or press Ctrl+Enter)\n');
      console.log('   This method is usually faster than CLI!\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n💡 Alternative: Use Supabase Dashboard');
    console.log('   1. Go to your Supabase project dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the contents of:');
    console.log(`      ${migrationPath}`);
    console.log('   4. Click Run\n');
    process.exit(1);
  }
}

// Run the migration
runMigration();

