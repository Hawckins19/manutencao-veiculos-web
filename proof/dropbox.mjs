import {empty, validate, merge} from './model.mjs';
export const APP_KEY='ozqdm8wryrbk4c8';
export const REDIRECT='https://hawckins19.github.io/manutencao-veiculos-web/proof/';
const AUTH_KEY='vehicle-proof-dropbox-auth';
const TOKEN_KEY='vehicle-proof-dropbox-session';
const PATH='/maintenance-proof-v1.json';
const LIMIT=5*1024*1024;
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function challenge(verifier){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));}
export function checkPending(saved,state,now=Date.now()){
  if(!saved || !state || saved.state!==state || typeof saved.verifier!=='string' || !/^[A-Za-z0-9_-]{43,128}$/.test(saved.verifier) || !Number.isFinite(saved.created) || now-saved.created>600000 || now<saved.created) throw new Error('Autorização inválida ou expirada. Volta a ligar ao Dropbox.');
  return saved;
}
export function session(){
  try{const s=JSON.parse(sessionStorage.getItem(TOKEN_KEY));return s && typeof s.token==='string' && s.expires>Date.now()+30000 ? s : null;}catch{return null;}
}
export function disconnect(){sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(AUTH_KEY);}
export async function connect(){
  if(location.origin+location.pathname!==REDIRECT)throw new Error('Abre o endereço oficial da base de teste para ligar ao Dropbox.');
  if(!navigator.onLine)throw new Error('Precisas de internet para ligar ao Dropbox.');
  const verifier=base64url(crypto.getRandomValues(new Uint8Array(32))), state=base64url(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(AUTH_KEY,JSON.stringify({verifier,state,created:Date.now()}));
  const params=new URLSearchParams({client_id:APP_KEY,response_type:'code',redirect_uri:REDIRECT,code_challenge:await challenge(verifier),code_challenge_method:'S256',state,token_access_type:'online',scope:'files.metadata.read files.content.read files.content.write'});
  location.assign('https://www.dropbox.com/oauth2/authorize?'+params);
}
export async function finishAuth(){
  const params=new URLSearchParams(location.search);
  if(!params.has('code')&&!params.has('error'))return false;
  let saved;try{saved=JSON.parse(sessionStorage.getItem(AUTH_KEY));}catch{}
  history.replaceState(null,'',location.pathname);
  sessionStorage.removeItem(AUTH_KEY);
  checkPending(saved,params.get('state'));
  if(params.has('error'))throw new Error('Autorização cancelada ou recusada no Dropbox.');
  const response=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:params.get('code'),grant_type:'authorization_code',client_id:APP_KEY,redirect_uri:REDIRECT,code_verifier:saved.verifier}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Não foi possível concluir a autorização. Confirma o endereço de redirecionamento e tenta ligar novamente.');
  const data=await response.json();
  if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new Error('Resposta de autorização inválida.');
  sessionStorage.setItem(TOKEN_KEY,JSON.stringify({token:data.access_token,expires:Date.now()+data.expires_in*1000}));
  return true;
}
function failure(status){
  if(status===401)return new Error('A sessão Dropbox expirou. Volta a ligar e tenta novamente.');
  if(status===403)return new Error('O Dropbox recusou o acesso. Confirma as permissões da aplicação.');
  if(status===429)return new Error('O Dropbox recebeu demasiados pedidos. Aguarda um pouco antes de repetir.');
  return new Error('Não foi possível sincronizar com o Dropbox. Os dados locais foram mantidos.');
}
export function createRemote(token,request=fetch){
  const call=(endpoint,headers,body)=>request('https://content.dropboxapi.com/2/files/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,...headers},body,signal:AbortSignal.timeout(30000)});
  return {
    async download(){
      const r=await call('download',{'Dropbox-API-Arg':JSON.stringify({path:PATH})});
      if(r.status===409){const e=await r.json();if(e.error?.['.tag']==='path'&&e.error.path?.['.tag']==='not_found')return {data:empty(),rev:null};throw failure(409);}
      if(!r.ok)throw failure(r.status);
      const metadata=JSON.parse(r.headers.get('Dropbox-API-Result')||'null');
      if(!metadata||typeof metadata.rev!=='string'||metadata.size>LIMIT)throw new Error('Metadados inválidos ou ficheiro Dropbox demasiado grande.');
      const body=await r.text();if(new TextEncoder().encode(body).length>LIMIT)throw new Error('O ficheiro Dropbox excede 5 MB.');
      return {data:validate(JSON.parse(body)),rev:metadata.rev};
    },
    async upload(data,rev){
      const body=JSON.stringify(validate(data));
      if(new TextEncoder().encode(body).length>LIMIT)throw new Error('Os dados excedem o limite de 5 MB desta prova. Exporta um backup.');
      const args={path:PATH,mode:rev?{'.tag':'update',update:rev}:{'.tag':'add'},autorename:false,strict_conflict:true,mute:true};
      const r=await call('upload',{'Content-Type':'application/octet-stream','Dropbox-API-Arg':JSON.stringify(args)},body);
      if(r.status===409){const e=await r.json();if(e.error?.['.tag']==='path'&&e.error.path?.reason?.['.tag']==='conflict'){const err=new Error('O ficheiro mudou durante a sincronização.');err.concurrent=true;throw err;}}
      if(!r.ok)throw failure(r.status);
      return r.json();
    }
  };
}
export async function synchronize({remote,readLocal,addLocal}){
  for(let attempt=0;attempt<3;attempt++){
    const cloud=await remote.download(), local=await readLocal(), combined=merge(local,cloud.data);
    try{await remote.upload(combined,cloud.rev);}catch(e){if(e.concurrent&&attempt<2)continue;throw e;}
    // Uma transação local relê o estado atual, preservando adições feitas noutro separador.
    const final=await addLocal(combined);
    return {data:final,pending:JSON.stringify(final)!==JSON.stringify(combined)};
  }
}
