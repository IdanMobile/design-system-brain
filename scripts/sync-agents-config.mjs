import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const cursorDir = path.join(rootDir, '.cursor');
const agentsDir = path.join(rootDir, '.agents');

function sync() {
  console.log('Starting Cursor to Antigravity config synchronization...');

  if (!fs.existsSync(cursorDir)) {
    console.error('Error: .cursor directory does not exist. Cannot sync.');
    process.exit(1);
  }

  // 1. Create .agents directory structure
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir);
    console.log('Created .agents directory.');
  }

  const agentsRulesDir = path.join(agentsDir, 'rules');
  if (!fs.existsSync(agentsRulesDir)) {
    fs.mkdirSync(agentsRulesDir);
    console.log('Created .agents/rules directory.');
  }

  // 2. Symlink skills directory
  const cursorSkillsDir = path.join(cursorDir, 'skills');
  const agentsSkillsDir = path.join(agentsDir, 'skills');

  if (fs.existsSync(cursorSkillsDir)) {
    if (fs.existsSync(agentsSkillsDir)) {
      // Remove existing symlink or folder to recreate
      try {
        fs.rmSync(agentsSkillsDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('Warning when removing existing skills target:', err.message);
      }
    }
    
    // Create symlink pointing to relative path '../.cursor/skills'
    fs.symlinkSync('../.cursor/skills', agentsSkillsDir, 'dir');
    console.log('Created symlink .agents/skills -> ../.cursor/skills');
  } else {
    console.log('No skills found in .cursor/skills to sync.');
  }

  // 3. Sync rules.md
  const cursorRulesFile = path.join(cursorDir, 'rules.md');
  const agentsRulesFile = path.join(agentsRulesDir, 'rules.md');
  if (fs.existsSync(cursorRulesFile)) {
    fs.copyFileSync(cursorRulesFile, agentsRulesFile);
    console.log('Synced rules.md -> .agents/rules/rules.md');
  }

  // 4. Sync custom rules (.mdc -> .md)
  const cursorRulesSubdir = path.join(cursorDir, 'rules');
  if (fs.existsSync(cursorRulesSubdir)) {
    // Clean rules inside .agents/rules/ first (except rules.md)
    const existingRules = fs.readdirSync(agentsRulesDir);
    for (const file of existingRules) {
      if (file !== 'rules.md') {
        fs.rmSync(path.join(agentsRulesDir, file), { force: true });
      }
    }

    const files = fs.readdirSync(cursorRulesSubdir);
    for (const file of files) {
      if (file.endsWith('.mdc')) {
        const srcPath = path.join(cursorRulesSubdir, file);
        const destName = file.slice(0, -4) + '.md';
        const destPath = path.join(agentsRulesDir, destName);

        const content = fs.readFileSync(srcPath, 'utf8');
        let cleanContent = content;
        
        // Strip YAML frontmatter if present
        if (content.startsWith('---')) {
          const secondDashesIndex = content.indexOf('---', 3);
          if (secondDashesIndex !== -1) {
            cleanContent = content.substring(secondDashesIndex + 3).trimStart();
          }
        }

        fs.writeFileSync(destPath, cleanContent, 'utf8');
        console.log(`Synced and converted rule: ${file} -> .agents/rules/${destName}`);
      }
    }
  }


  console.log('Synchronization complete!');
}

sync();
