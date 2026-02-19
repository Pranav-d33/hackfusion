import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const env = import.meta.env;
const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];
const missingKeys = requiredKeys.filter((key) => !env[key]);

let firebaseAuth = null;

if (missingKeys.length === 0) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const app = getApps().length ? getApps()[0] : initializeApp(config);
  firebaseAuth = getAuth(app);
} else {
  console.warn(
    'Firebase configuration missing. Set',
    missingKeys.join(', '),
    'in a Vite .env file to enable Firebase Auth.',
  );
}

export const auth = firebaseAuth;
