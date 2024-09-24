const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const downloadPath = path.resolve(__dirname);
const export_links_and_names = [
  { url: 'https://optmotorov.by/export_av_by1.csv', fileName: 'export_av_by_file.csv' },
  { url: 'https://optmotorov.by/export_drom1.csv', fileName: 'export_drom_file.csv' },
  { url: 'https://optmotorov.by/export_avito1.csv', fileName: 'export_avito_file.csv' },
  { url: 'https://optmotorov.by/export_bamper_by1.csv', fileName: 'export_to_bamper_by_file.csv' },
  { url: 'https://optmotorov.by/export_carro1.csv', fileName: 'export_carro_file.csv' }
];

// Функция для удаления старых файлов перед началом работы
function removeOldFiles() {
  fs.readdir(downloadPath, (err, files) => {
    if (err) {
      console.error('Ошибка чтения директории:', err);
      return;
    }
    files.forEach(file => {
      if (file.endsWith('_file.csv')) {
        const filePath = path.join(downloadPath, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`Старый файл ${file} удален.`);
        } catch (err) {
          console.error(`Ошибка при удалении файла ${file}:`, err);
        }
      }
    });
  });
}

// Функция для обработки файла после загрузки
async function processFile(downloadedFile, originalFileName) {
  const downloadedFilePath = path.join(downloadPath, downloadedFile);
  const originalFilePath = path.join(downloadPath, originalFileName);

  if (fs.existsSync(originalFilePath)) {
    console.log(`Файл ${originalFileName} существует. Перезаписываем его содержимое.`);
  } else {
    console.log(`Файл ${originalFileName} не существует. Создаем новый файл.`);
  }

  // Копируем содержимое скачанного файла в оригинальный файл
  fs.copyFileSync(downloadedFilePath, originalFilePath);
  console.log(`Содержимое файла ${downloadedFile} скопировано в ${originalFileName}.`);
}

// Функция для отслеживания прогресса
async function trackProgressUntilLink(page, linkSelector, timeoutMs = 60000) {
  let lastProgressValue = 0;
  let lastUpdateTime = Date.now();

  while (true) {
    try {
      const currentUrl = page.url();
      if (currentUrl.includes('export_') && currentUrl.includes('?download=1')) {
        console.log('Редирект на страницу скачивания. Останавливаем отслеживание.');
        break;
      }

      const [progress, linkPresent] = await Promise.all([
        page.evaluate(() => {
          const percentageElement = document.querySelector('.percentage.pull-right');
          if (percentageElement) {
            return parseInt(percentageElement.textContent.replace('%', ''), 10);
          }
          return null;
        }),
        page.evaluate(selector => !!document.querySelector(selector), linkSelector)
      ]);

      if (linkPresent) {
        console.log('\x1b[32m','Ссылка для скачивания появилась. Останавливаем отслеживание прогресса.','\x1b[0m');
        break;
      }

      if (progress !== null) {
        console.log(`Загрузка в процессе: ${progress}%`);
        if (progress !== lastProgressValue) {
          lastProgressValue = progress;
          lastUpdateTime = Date.now();
        } else if (Date.now() - lastUpdateTime > timeoutMs) {
          console.log("Загрузка зависла. Перезагружаем страницу...");
          throw new Error('Загрузка застряла');
        }
      } else {
        console.log('Процент загрузки не найден.');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error('Ошибка при отслеживании прогресса:', error);
      throw error;
    }
  }
}


// Функция для копирования содержимого _file.csv в файл без постфикса
function backupExistingFiles() {
  fs.readdir(downloadPath, (err, files) => {
    if (err) {
      console.error('Ошибка чтения директории:', err);
      return;
    }
    files.forEach(file => {
      if (file.endsWith('_file.csv')) {
        const filePath = path.join(downloadPath, file);
        const backupFileName = file.replace('_file', ''); // Убираем постфикс
        const backupFilePath = path.join(downloadPath, backupFileName);

        // Копируем содержимое в файл без постфикса
        if (fs.existsSync(filePath)) {
          fs.copyFileSync(filePath, backupFilePath);
          console.log(`Содержимое ${file} скопировано в ${backupFileName}.`);
        }
      }
    });
  });
}







// Основной код
(async () => {

  // Вызов функции для бэкапа файлов
  //backupExistingFiles();

  // Удаляем старые файлы перед началом работы
  //removeOldFiles();

  // Ограничение на время выполнения 15 минут
  const timeout = setTimeout(() => {
    console.error('Превышено максимальное время выполнения (15 минут). Завершаем процесс.');
    process.exit(1);
  }, 20 * 60 * 1000);

  // Запуск браузера
  const browser = await puppeteer.launch({
    headless: true,


    userDataDir: '/var/www/www-root/data/www/optmotorov.by/pupeeter_profiles_data',
    
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote'
    ]



  });

  for (const exportTask of export_links_and_names) {
    let retries = 0;
    let maxRetries = 3;
    let downloadSuccessful = false;

    while (retries < maxRetries && !downloadSuccessful) {
      const page = await browser.newPage();
      const client = await page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath
      });

      try {
        console.log('\x1b[33m',`Открытие страницы: ${exportTask.url}`,'\x1b[0m');
        await page.goto(exportTask.url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Включаем отслеживание процентов
        console.log('Включаем отслеживание процентов.');
        await trackProgressUntilLink(page, 'a[href*="?download=1"]');

        // Ждем файл и проверяем его наличие
        console.log("Ожидание появления файла...");
        const waitForFile = () => new Promise((resolve, reject) => {
          const checkInterval = 1000;
          const timeout = 10 * 60 * 1000;
          const startTime = Date.now();

          const checkFile = () => {
            fs.readdir(downloadPath, (err, files) => {
              if (err) return reject(err);

              const downloadedFile = files.find(file => file === exportTask.fileName && !file.endsWith('.crdownload'));

              if (downloadedFile) {
                console.log('\x1b[32m',`Файл ${exportTask.fileName} успешно скачан.`,'\x1b[0m');
                
                // Логика обработки файла
                const originalFileName = exportTask.fileName.replace('_file', '');
                processFile(downloadedFile, originalFileName); // Обрабатываем файл
                return resolve();
              }

              if (Date.now() - startTime > timeout) {
                return reject(new Error('Таймаут ожидания файла.'));
              }

              setTimeout(checkFile, checkInterval);
            });
          };

          setTimeout(checkFile, 3000);
        });

        await waitForFile();

        downloadSuccessful = true;

      } catch (error) {
        retries++;
        console.error(`Ошибка при загрузке файла ${exportTask.fileName}:`, error);
        if (retries < maxRetries) {
          console.log("Даем сайту отдохнуть - ждем 10 секунд...");
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
          console.log(`Не удалось загрузить файл ${exportTask.fileName} после ${maxRetries} попыток.`);
        }
      } finally {
        await page.close();
      }
    }
  }

  clearTimeout(timeout);
  await browser.close();
  console.log("Браузер закрыт. Программа завершена.");
  process.exit(0);
})();
