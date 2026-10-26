import {connect, finishAuth, session, disconnect, createRemote, synchronize} from './dropbox.mjs';
import {empty, validate, parseMoney, merge} from './model.mjs';
import {read, addRecords} from './storage.mjs';
const $=id=>document.getElementById(id), form=$('record-form');
let pending=null;
const money=new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'});
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function render(data){
  $('records').replaceChildren();
  $('count').textContent=data.records.length ? `${data.records.length} registo(s) guardado(s) neste dispositivo.` : 'Ainda sem registos. Adiciona um exemplo fictício para começar.';
  for(const r of [...data.records].sort((a,b)=>b.date.localeCompare(a.date))){
    const li=document.createElement('li'), title=document.createElement('strong'), meta=document.createElement('p'), notes=document.createElement('p');
    title.textContent=r.service;
    meta.textContent=`${r.date.split('-').reverse().join('/')} · ${r.km.toLocaleString('pt-PT')} km · ${r.cents===null?'Custo desconhecido':money.format(r.cents/100)}`;
    notes.textContent=r.notes;li.append(title,meta,notes);$('records').append(li);
  }
}
async function refresh(){render(await read());}
function download(data){
  const blob=new Blob([JSON.stringify(validate(data),null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=`manutencao-teste-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{
  const values=new FormData(form);const data=empty();
  data.records.push({id:crypto.randomUUID(),date:values.get('date'),km:Number(values.get('km')),cents:parseMoney(values.get('cost')),service:values.get('service'),notes:values.get('notes')});
  render(await addRecords(data));form.reset();markPending();message('Registo guardado neste dispositivo. Exporta um backup para o proteger.');
}catch(e){message(e.message,true);}finally{button.disabled=false;}});
$('export').onclick=async()=>{try{download(await read());message('Backup preparado para descarregar. Confirma que o ficheiro ficou guardado.');}catch(e){message(e.message,true);}};
function cancel(){pending=null;$('preview').hidden=true;$('import').value='';}
$('cancel').onclick=()=>{cancel();message('Importação cancelada. Os dados não foram alterados.');};
let selection=0;
$('import').onchange=async()=>{const request=++selection;pending=null;$('preview').hidden=true;try{
  const file=$('import').files[0];if(!file)return;if(file.size>5*1024*1024)throw new Error('O ficheiro excede o limite de 5 MB desta base de teste.');
  const data=validate(JSON.parse(await file.text())), current=await read(), combined=merge(current,data);
  if(request!==selection)return;pending=data;
  $('summary').textContent=`Ficheiro válido: ${data.records.length} registo(s). Serão acrescentados ${combined.records.length-current.records.length}.`;
  $('preview').hidden=false;message('Revê o resumo antes de confirmar.');
}catch(e){if(request===selection)message(e.message,true);}};
$('confirm').onclick=async()=>{if(!pending)return;$('confirm').disabled=true;try{render(await addRecords(pending));cancel();markPending();message('Importação concluída. Os registos existentes foram preservados.');}catch(e){message(e.message,true);}finally{$('confirm').disabled=false;}};
$('refresh').onclick=()=>refresh().catch(e=>message(e.message,true));
function network(){$('network').textContent=navigator.onLine?'Ligação disponível · dados locais':'Sem ligação · dados locais';}network();window.addEventListener('online',network);window.addEventListener('offline',network);
refresh().catch(e=>message('Armazenamento indisponível: '+e.message,true));
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{$('offline').textContent='Recursos offline preparados';}).catch(()=>{$('offline').textContent='Modo offline não preparado';});}else $('offline').textContent='Modo offline não suportado';

let syncing=false;
function cloudUI(){const linked=!!session();$('cloud-state').textContent=linked?'Dropbox: ligado neste separador':'Dropbox: não ligado ou sessão expirada';$('sync').disabled=!linked||syncing;$('disconnect').disabled=!linked||syncing;$('connect').disabled=syncing;}
function markPending(){$('sync-status').textContent='Há alterações locais. Carrega em “Sincronizar agora” quando tiveres ligação.';}
$('connect').onclick=()=>connect().catch(e=>message(e.message,true));
$('disconnect').onclick=()=>{disconnect();cloudUI();$('sync-status').textContent='Sessão removida deste separador. Os dados locais e no Dropbox foram mantidos.';};
$('sync').onclick=async()=>{
  const active=session();if(!active){cloudUI();message('Volta a ligar ao Dropbox.',true);return;}
  if(!navigator.onLine){message('Sem internet. Os registos continuam guardados localmente.',true);return;}
  syncing=true;cloudUI();form.querySelector('button').disabled=true;$('confirm').disabled=true;$('sync-status').textContent='A sincronizar…';
  try{const result=await synchronize({remote:createRemote(active.token),readLocal:read,addLocal:addRecords});render(result.data);$('sync-status').textContent=result.pending?'Foram detetadas novas adições locais. Sincroniza novamente.':'Sincronização concluída às '+new Date().toLocaleTimeString('pt-PT')+'. Volta a sincronizar para procurar alterações noutros dispositivos.';message('Os registos foram enviados e recebidos.');}
  catch(e){$('sync-status').textContent='Sincronização não concluída. Podes voltar a tentar; os dados locais foram mantidos.';message(e.name==='TimeoutError'?'O pedido demorou demasiado. Volta a tentar.':e.message,true);}
  finally{syncing=false;cloudUI();form.querySelector('button').disabled=false;$('confirm').disabled=false;}
};
cloudUI();
finishAuth().then(done=>{cloudUI();if(done)message('Dropbox ligado. Carrega em “Sincronizar agora” para enviar e receber os registos de teste.');}).catch(e=>{cloudUI();message(e.message,true);});
window.addEventListener('focus',cloudUI);
