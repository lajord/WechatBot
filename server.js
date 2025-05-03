import express from 'express';  // utilisation du framework express pour mon backend 
import bodyParser from 'body-parser'; // Pour permettre a express de comprendre les requetes HTTP
import xml2js from 'xml2js'; // Pour gerer les requetes XLM
import OpenAI from "openai";
import fs from 'fs';

const app = express();
const PORT = 8080;
const LOG_FILE = './logs.json';

// API key sk-7e8eab473f97484c97dd0be91cb192f0

app.use(bodyParser.text({ type: 'application/xml' }));

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-7e8eab473f97484c97dd0be91cb192f0'
});


// This function call DeepSeek's API, take in parameters a prompt and return a response
async function ApiCallDeepseek(prompt) {
  try {
    const response = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-chat",
      //max_tokens: 400 //limite la réponse a 400 tokens 
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error occurs with DeepSeek connection API", error);
    return `Erreur API DeepSeek : ${error.message || error}`;
  }
}

/*
The purpose of this function is to detect what type of request the user made.
By this way we can create a response more coherent with the user intention
*/
async function buildFinalPrompt(userPrompt) {
  const intentDetectionPrompt = `
        Voici une requête utilisateur : "${userPrompt}"
        Quel est le type de demande ?
        - explication_notion_ml
        - autre
        Réponds uniquement par l’étiquette exacte.`;
  
  let intent;
  try {
    const intentResponse = await ApiCallDeepseek(intentDetectionPrompt);
    intent = intentResponse.trim().toLowerCase();
    console.log("Intent détecté :", intent);
  } catch (error) {
    console.error("Erreur détection d'intention :", error);
    intent = "question_generale"; 
  }
  let finalPrompt;
  switch (intent) {
    case "explication_notion_ml":
      finalPrompt = `Voici la requete d'un eleve : ${userPrompt}, Explique-lui cette notion de machine learning avec clarté, comme le ferait un professeur expert, 
      Va droit au but sans sacrifier la compréhension.`;
      break;
    case "autre":
      finalPrompt = `Tu dois répondre mot par mot et ne rien dire d'autre que : Je suis désolé je ne suis pas créer pour répondre a ce genre de question`;
      break;
    default:
      finalPrompt = `Explique que tu n'as pas compris correrectement la requetes de l'utilisateur`;
      break;
  }

  return finalPrompt;
}





// Route pour recevoir les requêtes des utilisateurs -> A terme ca sera des requete XLM envoyer par WeChat
app.post('/wechat', async (req, res) => {
  const rawXml = req.body;
  
  xml2js.parseString(rawXml, async (err, result) => {
    if (err) {
      console.error("Erreur de parsing XML :", err);
      return res.status(400).send("Format XML invalide.");
    }

    try {
      const userPrompt = result.xml.Content?.[0];
      const fromUser = result.xml.FromUserName?.[0];

      if (!userPrompt || !fromUser) {
        console.warn("Données incomplètes dans la requête XML.");
        return res.status(400).send("Requête invalide.");
      }

      const finalPrompt = await buildFinalPrompt(userPrompt);

      if (!finalPrompt) {
        console.error("Prompt final vide.");
        return res.status(500).send("Erreur de traitement.");
      }

      const response = await ApiCallDeepseek(finalPrompt);

      console.log("Prompt final envoyé à l'IA :", finalPrompt);
      console.log("Réponse de l'IA :", response);

      res.status(200).send(response || "Pas de réponse.");

    } catch (e) {
      console.error("Erreur dans le traitement :", e);
      res.status(500).send("Erreur interne.");
    }
  });
});

// Run server
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
