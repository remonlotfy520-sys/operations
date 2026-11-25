import { firebaseConfig } from './config.js';

export async function loadApi() {
  if (firebaseConfig.apiKey) {
    const m = await import('./data-firebase.js');
    return m.firebaseApi;
  }
  const m = await import('./data-local.js');
  return m.localApi;
}
