const NAME = 'our-recipe-book';
const STORE = 'recipes';
let opening;
function openDb() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}
async function storeRequest(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = callback(tx.objectStore(STORE));
    let result;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction cancelled'));
  });
}
export const allRecipes = () => storeRequest('readonly', s => s.getAll());
export const putRecipe = recipe => storeRequest('readwrite', s => s.put(recipe));
export const getRecipe = id => storeRequest('readonly', s => s.get(id));
export const removeRecipe = id => storeRequest('readwrite', s => s.delete(id));
