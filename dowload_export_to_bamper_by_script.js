const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const downloadPath = path.resolve(__dirname); // Путь к директории, откуда запускается скрипт
const fileName = 'export_to_bamper_by.csv'; // Имя ожидаемого файла

(async () => {
  // Запуск браузера
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920x1080'
    ]
  });

  // Создание новой страницы
  const page = await browser.newPage();

  // Установка директории для загрузок
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath
  });

  // Открытие страницы
  console.log("Открытие страницы для генерации файла...");
  await page.goto('https://optmotorov.by/export_bamper_by1.csv', { waitUntil: 'networkidle2' });

  // Функция для отслеживания прогресса загрузки
  async function trackProgress() {
    // ... ваш код для отслеживания прогресса ...
  }

  // Запускаем отслеживание прогресса
  trackProgress();

  // Ждем, пока на странице появится ссылка на скачивание
  const downloadSelector = 'a[href^="/export_bamper_by1.csv?download"]';
  console.log("Ожидание ссылки на скачивание...");
  await page.waitForSelector(downloadSelector, { timeout: 200000 });

  // Получаем ссылку на файл
  const downloadLink = await page.$eval(downloadSelector, el => el.href);
  console.log(`Ссылка на скачивание получена: ${downloadLink}`);

  // Ждем, пока файл появится в директории
  console.log("Ожидание появления файла...");
  const waitForFile = () => new Promise((resolve, reject) => {
    const checkInterval = 1000; // Проверять каждые 1 секунду
    const timeout = 5 * 60 * 1000; // Таймаут через 5 минут
    const startTime = Date.now();

    const checkFile = () => {
      fs.readdir(downloadPath, (err, files) => {
        if (err) return reject(err);
        if (files.includes(fileName)) {
          console.log("Файл успешно скачан.");
          return resolve();
        }
        if (Date.now() - startTime > timeout) {
          return reject(new Error('Таймаут ожидания файла.'));
        }
        setTimeout(checkFile, checkInterval);
      });
    };

    checkFile();
  });

  await waitForFile();

  // Закрываем браузер и завершаем процесс
  await browser.close();
  console.log("Браузер закрыт. Программа завершена.");
  process.exit(0); // Завершаем процесс с кодом 0 (успешное завершение)
})();
