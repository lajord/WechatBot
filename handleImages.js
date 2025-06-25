import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';

export async function processWeChatImage(imageUrl, userId) {
  try {
    // 1. Télécharger l’image en mémoire
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    console.log("✅ Image téléchargée (en mémoire)");

    // 2. OCR sur le buffer directement (pas besoin d'écrire le fichier)
    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng+fra', {
      logger: m => console.log(`[OCR] ${m.status}: ${Math.floor(m.progress * 100)}%`)
    });

    console.log("✅ Texte OCR extrait pour", userId);

    // 3. Stocker le texte OCR dans un JSON (logs utilisateur)
    const ocrDir = path.resolve('./ocr');
    if (!fs.existsSync(ocrDir)) {
      fs.mkdirSync(ocrDir);
    }

    const outputPath = path.join(ocrDir, `${userId.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`);
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
