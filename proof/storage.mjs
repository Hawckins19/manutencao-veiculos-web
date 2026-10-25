import {empty, validate, merge} from './model.mjs';
const dbReady = new Promise((resolve,reject)=>{
  const req=indexedDB.open('vehicle-maintenance-proof-v1',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('state');
  req.onerror=()=>reject(req.error);
  req.onblocked=()=>reject(new Error('Fecha outros separadores desta aplicação e tenta novamente.'));
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close(); resolve(req.result);};
});
export async function read() {
  const db=await dbReady;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readonly'), req=tx.objectStore('state').get('current');
    req.onsuccess=()=>{try {resolve(validate(req.result || empty()));} catch(e) {reject(e);}};
    req.onerror=()=>reject(req.error);
  });
}
export async function addRecords(data) {
  const incoming=validate(data), db=await dbReady;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite'), store=tx.objectStore('state');
    let result, failure;
    const req=store.get('current');
    req.onsuccess=()=>{try {result=merge(req.result || empty(), incoming); store.put(result,'current');} catch(e) {failure=e; tx.abort();}};
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure || tx.error || new Error('Não foi possível guardar.'));
    tx.onerror=()=>{failure ||= tx.error;};
  });
}
