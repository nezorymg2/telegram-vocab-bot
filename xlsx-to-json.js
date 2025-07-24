// Скрипт для конвертации xlsx-файла "Словарь 3000 v2.9.xlsx" в JSON
// Убедись, что файл xlsx лежит в той же папке, что и этот скрипт

const xlsx = require('xlsx');
const fs = require('fs');

const XLSX_FILE = 'Словарь 3000 v2.9.xlsx';
const JSON_FILE = 'oxford3000.json';

function parseWorkbook() {
  const wb = xlsx.readFile(XLSX_FILE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  let currentSection = null;
  const result = [];

  for (let row of data) {
    // Если строка — это заголовок раздела (только одна непустая ячейка)
    if (row.length === 1 && row[0] && row[0].toString().trim().length > 0) {
      currentSection = row[0].toString().trim();
      continue;
    }
    // Если строка — это слово (столбец A — слово, столбец C — перевод)
    if (currentSection && row[0] && row[2]) {
      result.push({
        word: row[0].toString().trim(),
        translation: row[2].toString().trim(),
        section: currentSection
      });
    }
  }
  return result;
}

function main() {
  const words = parseWorkbook();
  fs.writeFileSync(JSON_FILE, JSON.stringify(words, null, 2), 'utf8');
  console.log(`Готово! Сохранено ${words.length} слов в ${JSON_FILE}`);
}

main();
