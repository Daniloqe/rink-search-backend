const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const axios = require("axios");

const app = express();
app.use(cors());

const pool = new Pool({
  user: "mariapogonchenko",
  host: "localhost",
  database: "rink_search",
  port: 5432,
});

// Функция для вычисления расстояния между двумя точками (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в км
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Функция для получения координат по ZIP-коду через OpenStreetMap API
async function getCoordinates(zipcode) {
  console.log(`🔍 Запрос координат для ZIP-кода: ${zipcode}`);
  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(zipcode)}`
    );

    if (response.data.length > 0) {
      const coords = {
        lat: parseFloat(response.data[0].lat),
        lng: parseFloat(response.data[0].lon),
      };
      console.log(`📍 Найдены координаты: ${coords.lat}, ${coords.lng}`);
      return coords;
    } else {
      console.log("⚠️ Не удалось найти координаты для этого ZIP-кода.");
      return null;
    }
  } catch (error) {
    console.error("❌ Ошибка при получении координат:", error);
    return null;
  }
}

// Функция нормализации ZIP-кода для Чехии
function normalizeZipcode(zipcode) {
    if (!zipcode) return "";
    const cleanZip = zipcode.replace(/\s+/g, ""); // Убираем все пробелы
    if (cleanZip.length === 5) {
      return `${cleanZip.slice(0, 3)} ${cleanZip.slice(3)}`; // Добавляем пробел после 3-го символа
    }
    return cleanZip;
  }
  
  // Обработчик запроса на поиск катков
  app.get("/rinks", async (req, res) => {
    let { zipcode, radius } = req.query;
    zipcode = normalizeZipcode(zipcode); // Приводим ZIP-код к стандартному формату
    const searchRadius = parseFloat(radius) || 10;
  
    console.log(`🔎 Поиск катков для ZIP-кода: "${zipcode}", радиус: ${searchRadius} км`);
  
    try {
      let coords;
  
      // Проверяем ZIP-код в базе
      const zipResult = await pool.query("SELECT lat, lng FROM rinks WHERE zipcode = $1 LIMIT 1", [zipcode]);
  
      if (zipResult.rows.length > 0) {
        coords = zipResult.rows[0];
        console.log("✅ ZIP-код найден в базе");
      } else {
        console.log("⚠️ ZIP-кода нет в базе, запрашиваем координаты...");
        coords = await getCoordinates(zipcode);
        if (!coords) {
          return res.status(400).json({ error: "Не удалось определить координаты по этому ZIP-коду" });
        }
      }
  
      const { lat, lng } = coords;
      console.log(`📍 Используем координаты: ${lat}, ${lng}`);
  
      // Запрашиваем все катки
      const result = await pool.query("SELECT * FROM rinks");
  
      // Фильтруем катки по радиусу
      const filteredRinks = result.rows.filter((rink) => {
        if (!rink.lat || !rink.lng) return false;
        const distance = getDistance(lat, lng, rink.lat, rink.lng);
        return distance <= searchRadius;
      });
  
      console.log(`🏒 Найдено катков в радиусе: ${filteredRinks.length}`);
      res.json(filteredRinks);
    } catch (error) {
      console.error("❌ Ошибка сервера:", error);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  });  

const PORT = 3001;
const path = require("path");

// Отдаём фронтенд
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
