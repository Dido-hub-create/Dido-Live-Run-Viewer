import {writeFile} from 'node:fs/promises';
import {databaseURL} from '../web/model.js';
try {
  const url=databaseURL(process.env.FIREBASE_DATABASE_URL || '');
  await writeFile('web/config.json',JSON.stringify({databaseURL:url})+'\n');
} catch {
  console.error('Задайте валиден HTTPS Firebase Realtime Database URL в repository variable FIREBASE_DATABASE_URL. Вижте README.md.');
  process.exitCode=1;
}
