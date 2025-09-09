import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sourceDir = path.join(__dirname, '..', 'example_data');
const targetDir = path.join(__dirname, 'public', 'example_data');

try {
    if (!fs.existsSync(sourceDir)) {
        console.error('❌ Source directory example_data not found in root');
        process.exit(1);
    }

    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        console.log('🗑️  Removed existing example_data from frontend/public');
    }

    fs.cpSync(sourceDir, targetDir, { recursive: true });

    console.log('✅ Successfully copied example_data to frontend/public/');
    
    const listFiles = (dir: string, prefix = '') => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        items.forEach(item => {
            if (item.isDirectory()) {
                console.log(`📁 ${prefix}${item.name}/`);
                listFiles(path.join(dir, item.name), prefix + '  ');
            } else {
                console.log(`📄 ${prefix}${item.name}`);
            }
        });
    };

    console.log('\n📋 Copied files:');
    listFiles(targetDir);

} catch (error) {
    console.error('❌ Error copying example_data:', (error as Error).message);
    process.exit(1);
}