import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Define which variables to sync from root .env to frontend .env
const VARIABLES_TO_SYNC = {
    BACKEND_BASE_URL: 'VITE_BACKEND_BASE_URL',
    // Add more variables here as needed
} as const;

const rootEnvPath = path.join(__dirname, '..', '.env');
const frontendEnvPath = path.join(__dirname, '.env');

try {
    // Read root .env
    const rootEnvContent = fs.readFileSync(rootEnvPath, 'utf8');

    // Parse root .env into key-value pairs
    const rootEnvVars: Record<string, string> = {};
    rootEnvContent.split('\n').forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                rootEnvVars[key] = valueParts.join('=').replace(/"/g, '');
            }
        }
    });

    // Build frontend .env content
    let frontendEnvContent = '';
    let syncedCount = 0;

    for (const [rootVar, frontendVar] of Object.entries(VARIABLES_TO_SYNC)) {
        if (rootEnvVars[rootVar]) {
            frontendEnvContent += `${frontendVar}=${rootEnvVars[rootVar]}\n`;
            console.log(`✅ Synced ${rootVar} -> ${frontendVar} (${rootEnvVars[rootVar]})`);
            syncedCount++;
        } else {
            console.warn(`⚠️  Variable ${rootVar} not found in root .env`);
        }
    }

    if (syncedCount === 0) {
        console.error('❌ No variables were synced');
        process.exit(1);
    }

    // Write to frontend .env
    fs.writeFileSync(frontendEnvPath, frontendEnvContent);

    console.log(`\n🎉 Successfully synced ${syncedCount} environment variable(s) to frontend/.env`);
} catch (error) {
    console.error('❌ Error syncing environment variables:', (error as Error).message);
    process.exit(1);
}
