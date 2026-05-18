const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('Сгенерирована пара VAPID-ключей:');
console.log('  Public  Key:', publicKey);
console.log('  Private Key:', privateKey);

const ENV_PATH      = path.join(__dirname, '..', '.env');
const SAFE_ENV_PATH = path.join(__dirname, '..', '.env.new');
const targetPath = fs.existsSync(ENV_PATH) ? SAFE_ENV_PATH : ENV_PATH;

const contents = [
    '# Сгенерировано scripts/generate-vapid.js',
    `# Дата: ${new Date().toISOString()}`,
    '',
    'PORT=3001',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    'VAPID_SUBJECT=mailto:dev@notes-app.local',
    '',
].join('\n');

fs.writeFileSync(targetPath, contents, 'utf8');

console.log('');
console.log(`Сохранено в: ${targetPath}`);
if (targetPath === SAFE_ENV_PATH) {
    console.log('У вас уже есть .env — новые ключи положены рядом, в .env.new.');
    console.log('Если хотите заменить — скопируйте вручную (это сбросит подписки).');
}
