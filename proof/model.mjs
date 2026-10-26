export const FORMAT = 'vehicle-maintenance-proof';
export function validate(data) {
  if (!data || data.format !== FORMAT || ![1,2].includes(data.version) || !Array.isArray(data.records) || data.records.length > 10000) throw new Error('Formato de backup inválido ou versão não suportada.');
  const ids = new Set();
  const records = data.records.map(r => {
    if (!r || typeof r.id !== 'string' || r.id.length > 100 || !r.id || ids.has(r.id)) throw new Error('Identificador inválido ou repetido.');
    ids.add(r.id);
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10) !== r.date) throw new Error('Data inválida.');
    if (!Number.isSafeInteger(r.km) || r.km < 0 || r.km > 10000000) throw new Error('Quilometragem inválida.');
    if (r.cents !== null && (!Number.isSafeInteger(r.cents) || r.cents < 0 || r.cents > 100000000)) throw new Error('Custo inválido.');
    if (typeof r.service !== 'string' || !r.service.trim() || r.service.length > 300 || typeof r.notes !== 'string' || r.notes.length > 2000) throw new Error('Descrição ou observações inválidas.');
    return {id:r.id, date:r.date, km:r.km, cents:r.cents, service:r.service.trim(), notes:r.notes};
  });
  const vehicleRevisions=data.version===1 ? [] : validateVehicleRevisions(data.vehicleRevisions);
  const result={format:FORMAT, version:2, records, vehicleRevisions};
  if(new TextEncoder().encode(JSON.stringify(result)).length>5*1024*1024)throw new Error('O conjunto de dados excede o limite de 5 MB desta versão.');
  return result;
}
export function empty() { return {format:FORMAT, version:2, records:[], vehicleRevisions:[]}; }
export function parseMoney(value) {
  if (!value.trim()) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error('Usa um valor como 12,50, sem separadores de milhares.');
  const [whole, fraction=''] = value.trim().replace(',', '.').split('.');
  const cents = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(cents) || cents > 100000000) throw new Error('Valor demasiado elevado.');
  return cents;
}
export function merge(current, incoming) {
  const a=validate(current), b=validate(incoming), byId=new Map(a.records.map(r=>[r.id,r]));
  for (const r of b.records) {
    if (byId.has(r.id) && JSON.stringify(byId.get(r.id)) !== JSON.stringify(r)) throw new Error('Existem versões diferentes do mesmo registo. Nada foi importado.');
    byId.set(r.id,r);
  }
  const revisions=new Map(a.vehicleRevisions.map(r=>[r.id,r]));
  for(const r of b.vehicleRevisions){if(revisions.has(r.id)&&JSON.stringify(revisions.get(r.id))!==JSON.stringify(r))throw new Error('Versões diferentes da ficha do veículo.');revisions.set(r.id,r);}
  return validate({...a, records:[...byId.values()], vehicleRevisions:[...revisions.values()]});
}

function validateVehicleRevisions(value){
 if(!Array.isArray(value)||value.length>1000)throw new Error('Histórico da ficha inválido.');
 const ids=new Set();
 const revisions=value.map(r=>{
 if(!r||typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id))throw new Error('Identificador da ficha inválido.');ids.add(r.id);
 if(r.parent!==null&&(typeof r.parent!=='string'||r.parent.length>100))throw new Error('Antecessor inválido.');
 if(typeof r.name!=='string'||!r.name.trim()||r.name.length>100||!['mota','automóvel','outro'].includes(r.kind))throw new Error('Ficha do veículo inválida.');
 if(r.year!==null&&(!Number.isInteger(r.year)||r.year<1886||r.year>2100))throw new Error('Ano inválido.');
 return {id:r.id,parent:r.parent,name:r.name.trim(),kind:r.kind,year:r.year};
 });
 if(!revisions.length)return revisions;
 const roots=revisions.filter(r=>r.parent===null), children=new Map();
 for(const r of revisions){if(r.parent!==null&&!ids.has(r.parent))throw new Error('Histórico da ficha incompleto.');if(children.has(r.parent))throw new Error('A ficha foi alterada em dois dispositivos. Sincronização bloqueada para preservar ambas as versões.');children.set(r.parent,r);}
 if(roots.length!==1)throw new Error('Conflito entre fichas de veículos.');
 let r=roots[0],visited=new Set();while(r){if(visited.has(r.id))throw new Error('Histórico da ficha inválido.');visited.add(r.id);r=children.get(r.id);}
 if(visited.size!==revisions.length)throw new Error('Histórico da ficha inválido.');
 return revisions;
}
export function vehicle(data){const revisions=validate(data).vehicleRevisions;const parents=new Set(revisions.map(r=>r.parent));return revisions.find(r=>!parents.has(r.id))||null;}
export function vehicleChange(data,fields,id){const state=validate(data),previous=vehicle(state);return validate({...state,vehicleRevisions:[...state.vehicleRevisions,{id,parent:previous?.id||null,...fields}]});}

export function createId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}
