import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';

export async function processWeChatImage(imageUrl, userId) {
  const imageId = `${Date.now()}_${userId}`;
  const imagePath = `./images/${imageId}.jpg`;

  try {
    // 1. Télécharger
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, response.data);
    console.log("✅ Image téléchargée :", imagePath);

    // 2. OCR
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+fra', {
      logger: m => console.log(`[OCR] ${m.status}: ${Math.floor(m.progress * 100)}%`)
    });

    console.log("✅ Texte OCR extrait pour", userId);

    // 3. Supprimer l’image
    try {
      fs.unlinkSync(imagePath);
      console.log("🗑️ Image supprimée :", imagePath);
    } catch (deleteErr) {
      console.warn("⚠️ Impossible de supprimer l’image :", deleteErr.message);
    }

    // 4. Stocker le texte OCR
    const outputPath = `./ocr/${userId.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
    const ocrLog = {
      timestamp: new Date().toISOString(),
      text: text.trim()
    };

    let existing = [];
    if (fs.existsSync(outputPath)) {
      const raw = fs.readFileSync(outputPath, 'utf8');
      existing = raw ? JSON.parse(raw) : [];
    }
    existing.push(ocrLog);
    fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

    return text.trim();
  } catch (err) {
    console.error("❌ Erreur traitement image :", err);
    return null;
  }
}
