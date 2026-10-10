import { allRecipes, putRecipe } from './db.js';

const KEY = 'our-recipe-cloud-settings';
const HOUSEHOLD_KEY = 'our-recipe-household';
let client = null;
let busy = false;
let changeCallback = () => {};
let timer = null;
let lastError = '';

export const getCloudConfig = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export const setCloudConfig = ({url, key}) => {
  localStorage.setItem(KEY, JSON.stringify({ url: url.trim().replace(/\/$/, ''), key: key.trim() }));
  client = null;
};
export const getHouseholdId = () => localStorage.getItem(HOUSEHOLD_KEY) || '';
export const setHouseholdId = id => localStorage.setItem(HOUSEHOLD_KEY, id);
export const isConfigured = () => { const c = getCloudConfig(); return /^https:\/\/[a-z\d-]+\.supabase\.co$/i.test(c.url || '') && !!c.key; };
export const getLastSyncError = () => lastError;
export const hasClient = () => !!client;
export function onSyncChange(fn) { changeCallback = fn; }
function changed() { try { changeCallback(); } catch (error) { console.warn(error); } }

export async function initializeCloud() {
  if (!isConfigured()) return null;
  if (!client) {
    // Only loaded when sharing is enabled. Local use has no external dependency.
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.58.0');
    const c = getCloudConfig();
    client = createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }});
    client.auth.onAuthStateChange(() => changed());
  }
  return client;
}
export async function getSession() {
  if (!isConfigured()) return null;
  const api = await initializeCloud();
  const {data, error} = await api.auth.getSession();
  if (error) throw error;
  return data.session;
}
export async function connectDevice() {
  const api = await initializeCloud();
  const {data,error} = await api.auth.signInAnonymously();
  if (error) throw error;
  changed();
  return data;
}
export async function signOut() {
  const api = await initializeCloud();
  const {error} = await api.auth.signOut();
  if (error) throw error;
  localStorage.removeItem(HOUSEHOLD_KEY);
  changed();
}
export async function getHouseholds() {
  const api = await initializeCloud();
  const {data, error} = await api.from('households').select('id,name,invite_code').order('created_at');
  if (error) throw error;
  return data || [];
}
export async function createHousehold(name) {
  const api = await initializeCloud();
  const {data,error} = await api.rpc('create_household', {p_name: name.trim() || 'Our Recipes'});
  if (error) throw error;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first?.household_id) throw new Error('Could not create shared library.');
  setHouseholdId(first.household_id);
  changed();
  return first;
}
export async function joinHousehold(code) {
  const api = await initializeCloud();
  const {data,error} = await api.rpc('join_household', {p_code: code.trim().toLowerCase()});
  if (error) throw error;
  setHouseholdId(data);
  changed();
  return data;
}

function fromRemote(r) {
  return {
    id: r.id, title: r.title, category: r.category, status: r.status,
    ingredients: r.ingredients || '', instructions: r.instructions || '', notes: r.notes || '',
    sourceUrl: r.source_url || '', servings: r.servings || '', prepMinutes: r.prep_minutes || '',
    cookMinutes: r.cook_minutes || '', photo: null, imagePath: r.image_path || '',
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
    dirty: false, imageDirty: false
  };
}
function forRemote(r, householdId) {
  return {
    id: r.id, household_id: householdId,
    title: r.title, category: r.category, status: r.status,
    ingredients: r.ingredients || '', instructions: r.instructions || '', notes: r.notes || '',
    source_url: r.sourceUrl || '', servings: r.servings || null,
    prep_minutes: r.prepMinutes || null, cook_minutes: r.cookMinutes || null,
    image_path: r.imagePath || null, created_at: r.createdAt, updated_at: r.updatedAt,
    deleted_at: r.deletedAt || null
  };
}
async function imageDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob);
  });
}
async function downloadPhoto(api, path) {
  if (!path) return null;
  const {data,error} = await api.storage.from('recipe-images').download(path);
  if (error) throw error;
  return imageDataUrl(data);
}
function toBlob(dataUrl) {
  const [head,content] = dataUrl.split(',');
  const type = head.match(/^data:(image\/(?:jpeg|png|webp));base64$/i)?.[1];
  if (!type) throw new Error('Unsupported photo type for cloud sync');
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {type});
}

export async function syncNow() {
  if (busy || !navigator.onLine || !isConfigured() || !getHouseholdId()) return false;
  busy = true; lastError = ''; changed();
  try {
    const api = await initializeCloud();
    const {data: {session}} = await api.auth.getSession();
    if (!session) return false;
    const householdId = getHouseholdId();
    const {data: remoteRows, error} = await api.from('recipes').select('*').eq('household_id',householdId);
    if (error) throw error;
    const localRows = await allRecipes();
    const localMap = new Map(localRows.map(r => [r.id, r]));
    const remoteMap = new Map((remoteRows || []).map(r => [r.id,r]));
    for (const remote of (remoteRows || [])) {
      const local = localMap.get(remote.id);
      const remoteDate = Date.parse(remote.updated_at || 0);
      if (!local || remoteDate > Date.parse(local.updatedAt || 0)) {
        const item = fromRemote(remote);
        if (remote.image_path && local?.imagePath === remote.image_path && local?.photo && !local.imageDirty) {
          item.photo = local.photo;
        } else if (remote.image_path) {
          try { item.photo = await downloadPhoto(api, remote.image_path); }
          catch (imageError) { console.warn('Photo cache failed',imageError); }
        }
        await putRecipe(item);
        localMap.set(item.id, item);
      } else if (!local.photo && remote.image_path && !local.dirty) {
        // Retry a previously interrupted photo download on the next sync.
        try {
          const photo = await downloadPhoto(api, remote.image_path);
          const recovered = {...local,photo};
          await putRecipe(recovered);
          localMap.set(recovered.id,recovered);
        } catch(imageError) {console.warn('Photo is not cached yet',imageError);}
      }
    }
    for (const r of localMap.values()) {
      const remote = remoteMap.get(r.id);
      if (!r.dirty && remote) continue;
      if (remote && Date.parse(remote.updated_at) > Date.parse(r.updatedAt)) continue;
      const item = {...r};
      if (item.deletedAt) {
        item.imagePath = '';
      } else if (item.photo && (item.imageDirty || !remote)) {
        const path = `${householdId}/${item.id}-${Date.parse(item.updatedAt)}.jpg`;
        const {error: uploadError} = await api.storage.from('recipe-images').upload(path, toBlob(item.photo), {
          upsert:true, contentType:'image/jpeg', cacheControl:'60'
        });
        if (uploadError) throw uploadError;
        item.imagePath = path;
      }
      const {error: saveError} = await api.from('recipes').upsert(forRemote(item,householdId), {onConflict:'id'});
      if (saveError) throw saveError;
      const oldPath = remote?.image_path;
      if (oldPath && oldPath !== item.imagePath) {
        const {error:removeError} = await api.storage.from('recipe-images').remove([oldPath]);
        if (removeError) console.warn('Old photo cleanup failed',removeError);
      }
      item.dirty = false; item.imageDirty = false;
      await putRecipe(item);
    }
    changed();
    return true;
  } catch (error) {
    lastError = error?.message || 'Unknown syncing error';
    console.error('Recipe sync:',error);
    changed();
    return false;
  } finally { busy = false; changed(); }
}
export function isSyncing() { return busy; }
export function startAutoSync() {
  if (timer) return;
  timer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 90000);
  window.addEventListener('online', syncNow);
  window.addEventListener('focus', syncNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
}
