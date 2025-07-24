// Конвертер Must-have IELTS Vocabulary.mht (html) -> ielts.json
// npm install cheerio
const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('Must-have IELTS Vocabulary.mht', 'utf8');
const $ = cheerio.load(html);
function clean(str) {
  return str
    .replace(/=+\s*|<=?\s*\/o:p>|<o:p>|<\/o:p>/gi, '')
    .replace(/&#[0-9]+;?/g, c => {
      const m = c.match(/\d+/);
      return m ? String.fromCharCode(parseInt(m[0], 10)) : '';
    })
    .replace(/\d{2,4};?\W*/g, '') // удаляем коды типа 085; 099; и т.п.
    .replace(/\u[0-9a-fA-F]{4}/g, '')
    .replace(/[=\x01]+/g, '') // убираем = и управляющие символы
    .replace(/\s+/g, ' ')
    .replace(/\s*\W+\s*$/g, '')
    .replace(/^\W+|\W+$/g, '')
    .trim();
}
function cleanTranslation(str) {
  // Удаляем управляющие символы и коды, затем склеиваем все буквы подряд
  return str
    .replace(/[\x00-\x1F=]+/g, '') // управляющие символы и =
    .replace(/\d{2,4};?/g, '') // коды типа 085; 099;
    .replace(/<[^>]+>/g, '') // html-теги
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Zа-яА-ЯёЁ,\s-]/g, '') // только буквы, пробелы, запятые, дефисы
    .replace(/^\s+|\s+$/g, '')
    .trim();
}
const words = [];
$('tr').each((i, tr) => {
  const tds = $(tr).find('td');
  if (i < 5) {
    // Для отладки: выводим сырые значения слова и перевода
    console.log('RAW:', {
      word: $(tds[0]).text(),
      translation: $(tds[1]).text()
    });
  }
  if (tds.length >= 2) {
    let word = clean($(tds[0]).text());
    let translation = cleanTranslation($(tds[1]).text());
    // Новый фильтр: перевод должен содержать хотя бы одну букву
    if (word && translation &&
        !/^word$/i.test(word) &&
        !/^translation$/i.test(translation) &&
        /[a-zA-Zа-яА-ЯёЁ]/.test(translation) &&
        translation.length > 1 &&
        !/^(span|p|k\d+)$/i.test(translation)) {
      words.push({ word, translation });
    }
  }
});
// Выводим первые 10 пар для контроля
console.log('Sample:', words.slice(0, 10));
// Удаляем дубли
const unique = [];
const seen = new Set();
for (const w of words) {
  const key = w.word.toLowerCase() + '|' + w.translation.toLowerCase();
  if (!seen.has(key)) {
    unique.push(w);
    seen.add(key);
  }
}
fs.writeFileSync('ielts.json', JSON.stringify(unique, null, 2), 'utf8');
console.log('Done! Words:', unique.length);
