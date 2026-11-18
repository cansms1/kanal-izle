// Günlük kanal denetimi: data/kanallar.m3u içindeki her adresi dener,
// sonucu data/durum.json dosyasına yazar. Uygulama bu dosyayı açılışta okur.
// Ağ hatasında (belirsiz) son bilinen durum korunur; hata çıkışı vermez.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function m3uAdresleri(metin) {
  const adresler = [];
  for (const satir of metin.split(/\r?\n/)) {
    const s = satir.trim();
    if (!s || s.startsWith('#')) continue;
    adresler.push(s);
  }
  return [...new Set(adresler)];
}

// durum: HTTP kodu, ya da ağ hatasında null
export function sonucSinifla(durum, metin = '') {
  if (durum === null) return 'belirsiz';
  if (durum < 200 || durum >= 300) return 'kapali';
  if (/^\s*</.test(metin) && !/#EXTM3U/.test(metin)) return 'kapali'; // HTML hata sayfası yayın değildir
  return 'acik';
}

async function birKez(adres, getir, sure) {
  try {
    const yanit = await getir(adres, {
      method: 'GET', redirect: 'follow', cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 kanal-izle-denetim' },
      signal: AbortSignal.timeout(sure),
    });
    const metin = yanit.ok ? (await yanit.text()).slice(0, 2000) : '';
    return sonucSinifla(yanit.status, metin);
  } catch (e) {
    return null;
  }
}

export async function denetle(adresler, { getir = fetch, sure = 15000, es = 6 } = {}) {
  const sonuc = {};
  let sira = 0;
  const isci = async () => {
    while (sira < adresler.length) {
      const adres = adresler[sira++];
      let r = await birKez(adres, getir, sure);
      if (r === null) r = await birKez(adres, getir, sure); // ağ hatasında bir kez daha dene
      sonuc[adres] = r === null ? 'belirsiz' : r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(es, adresler.length) }, isci));
  return sonuc;
}

export function durumDosyasiOlustur(adresler, sonuc, onceki, simdi) {
  const kanallar = {};
  for (const a of adresler) {
    const r = sonuc[a] || 'belirsiz';
    const eski = onceki[a];
    if (r === 'belirsiz') {
      kanallar[a] = eski && eski.durum !== 'belirsiz' ? eski : { durum: 'belirsiz', son: simdi };
    } else {
      kanallar[a] = { durum: r, son: simdi };
    }
  }
  const ozet = { acik: 0, kapali: 0, belirsiz: 0 };
  for (const k of Object.values(kanallar)) ozet[k.durum] = (ozet[k.durum] || 0) + 1;
  return { guncellendi: simdi, ozet, kanallar };
}

async function ana() {
  const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const adresler = m3uAdresleri(readFileSync(path.join(kok, 'data/kanallar.m3u'), 'utf8'));
  const sonuc = await denetle(adresler);
  const dosya = path.join(kok, 'data/durum.json');
  let onceki = {};
  try { onceki = JSON.parse(readFileSync(dosya, 'utf8')).kanallar || {}; } catch (e) { onceki = {}; }
  const veri = durumDosyasiOlustur(adresler, sonuc, onceki, new Date().toISOString());
  writeFileSync(dosya, JSON.stringify(veri, null, 2) + '\n', 'utf8');
  console.log('Denetim bitti:', JSON.stringify(veri.ozet));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ana().catch((e) => { console.error(e); process.exitCode = 0; });
}
