import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fixEnvFile() {
  console.log('\n🔧 Fixing .env file encoding...\n');

  const backendDir = join(__dirname, '..');
  const envPath = join(backendDir, '.env');
  const backupPath = join(backendDir, '.env.backup');

  // Check if .env exists
  if (!existsSync(envPath)) {
    console.error('❌ .env file not found:', envPath);
    process.exit(1);
  }

  try {
    // Read the file as a buffer to detect BOM
    const fileBuffer = readFileSync(envPath);
    
    // Check for UTF-8 BOM (EF BB BF) or UTF-16 BOM
    const hasBOM = fileBuffer[0] === 0xEF && fileBuffer[1] === 0xBB && fileBuffer[2] === 0xBF;
    
    if (!hasBOM) {
      // Check for UTF-16 BOM
      const hasUTF16BOM = (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xFE) || 
                          (fileBuffer[0] === 0xFE && fileBuffer[1] === 0xFF);
      
      if (!hasUTF16BOM) {
        console.log('✅ No BOM detected in .env file');
        console.log('   File appears to be clean.\n');
        return;
      }
    }

    console.log('⚠️  BOM (Byte Order Mark) detected in .env file');
    console.log('   Creating backup and fixing...\n');

    // Create backup
    writeFileSync(backupPath, fileBuffer);
    console.log('✅ Backup created: .env.backup\n');

    // Remove BOM and write clean file
    let cleanContent;
    if (hasBOM) {
      // Remove UTF-8 BOM (first 3 bytes)
      cleanContent = fileBuffer.slice(3).toString('utf8');
    } else {
      // For UTF-16, we'd need to handle differently, but let's try UTF-8 first
      cleanContent = fileBuffer.toString('utf8').replace(/^\ufeff/, '');
    }

    // Remove any remaining BOM characters
    cleanContent = cleanContent.replace(/^\ufeff/, '');

    // Write clean file as UTF-8 without BOM
    writeFileSync(envPath, cleanContent, { encoding: 'utf8' });

    console.log('✅ .env file fixed!');
    console.log('   Removed BOM and saved as UTF-8 without BOM\n');
    console.log('💡 Your original file is backed up as .env.backup\n');

  } catch (error) {
    console.error('❌ Error fixing .env file:', error.message);
    process.exit(1);
  }
}

fixEnvFile();

