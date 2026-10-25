export const FORMAT = 'vehicle-maintenance-proof';
export function validate(data) {
  if (!data || data.format !== FORMAT || data.version !== 1 || !Array.isArray(data.records) || data.records.length > 10000) throw new Error('Formato de backup inválido ou versão não suportada.');
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
  return {format:FORMAT, version:1, records};
}
export function empty() { return {format:FORMAT, version:1, records:[]}; }
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
  return validate({...a, records:[...byId.values()]});
}
