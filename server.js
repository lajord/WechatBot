import express from 'express';  // using the express framework for my backend  
import bodyParser from 'body-parser'; // To help express understand HTTP requests
import xml2js from 'xml2js'; // To manage XLM requests
import OpenAI from "openai"; // for use deepseek
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
// import { pipeline } from '@xenova/transformers';




const app = express();
const PORT = 80;

const LOG_FILE = './logs.json';


const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}



//-------------------------------------------------------------------------------------------//
// Load the embedding model
// This will be used to create embeddings for the documents

// let embeddingPipeline = null;
// let isModelReady = false;


// async function loadEmbeddingModel() {
//   try {
//     console.log("⏳ Loading embedding model...");
//     embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
//     isModelReady = true;
//     console.log("✅ Embedding model loaded and ready.");
//   } catch (error) {
//     console.error("❌ Failed to load embedding model:", error);
//   }
// }
// loadEmbeddingModel();




app.use(bodyParser.text({ type: 'application/xml' })); //this line indicates that the inputs to be read will be in XLM format

//API connection
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-7e8eab473f97484c97dd0be91cb192f0'
});

//-------------------------------------------------------------------------------------------//


//-------------------------------------------------------------------------------------------//

// This function call DeepSeek's API, take in parameters a prompt and return a response
async function ApiCallDeepseek(prompt) {
  try {
    const response = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-chat",
    });
    return response.choices[0].message.content;

  } catch (error) {
    console.error("Error occurs with DeepSeek connection API", error);
    return `Erreur API DeepSeek : ${error.message || error}`;
  }
}

//-------------------------------------------------------------------------------------------//


//-------------------------------------------------------------------------------------------//

/*
The purpose of this function is to detect what type of request the user made.
By this way we can create a response more coherent with the user intention

Ici y'aura un travail d'entrainer un petit model pour detecter les intentions de l'utilisateur.

*/
async function buildFinalPrompt(userPrompt, userId)
 {

  //First prompt to identify the nature of the user's request 
  const intentDetectionPrompt = `
  Here is a user query: "${userPrompt}"
  
  Identify the type(s) of request this query represents. You can select one or more labels from the following list:
  
  - explanation_notion_ml
  - correction_student_input
  - exam_creation
  - generate_study_plan
  - other
  
  Rules:
  - If the request is not related to machine learning, regardless of intent or content, return only: other.
  - Do NOT combine "other" with any other labels. If it's not about machine learning, the answer must be strictly: other.
  - Do not try to reinterpret general topics (math, programming, etc.) as ML if not explicitly linked.
  
  Return only the labels, separated by commas. Do not add explanations.
  `;
  
  let intent;
  try {
    const intentResponse = await ApiCallDeepseek(intentDetectionPrompt);
    intent = intentResponse.trim().toLowerCase();
  } catch (error) {
    console.error("Erreur détection d'intention :", error);
    intent = "idk"; 
  }
  let finalPrompt;
  const lowerIntent = intent.toLowerCase();
  console.log(lowerIntent)
  if (lowerIntent.includes("explanation_notion_ml") && lowerIntent.includes("correction_student_input")) {
        finalPrompt = `Speak in English. The student is asking for both an explanation of a machine learning concept and help with related code or reasoning. 

    Start by explaining the concept the student wants to understand in a clear, pedagogical, and efficient way, just as an expert teacher would. Adapt the explanation depending on the student's input:

    - If the student makes a statement about the concept that seems incorrect or unclear, correct it with a constructive tone and use the opportunity to deepen the explanation.
    - If the student is asking for help writing code, guide them by suggesting structure, pointing out possible challenges or common mistakes, and offering useful hints — but **do not** provide a full solution.
    - If the student provides code, review it and help correct mistakes while reinforcing the conceptual understanding behind the fix.

    Here is the full student request:
    """
    ${userPrompt}
    """`;
    }
  else if (lowerIntent.includes("explanation_notion_ml")&& lowerIntent.includes("correction_creation_code_algo_machinelearning")) {
    finalPrompt = `Speak in English, Here's a student's request: ${userPrompt}, Explain this concept of machine learning clearly, as an expert teacher would, 
    Get straight to the point without sacrificing comprehension.`;

  }else if (lowerIntent.includes("generate_study_plan")) {
        const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-_]/g, "_");
        const userLogFile = path.join(LOGS_DIR, `${sanitizedUserId}.json`);

        if (!fs.existsSync(userLogFile)) {
          return {
            finalPrompt: null,
            intent: "generate_study_plan_no_data"
          };
        }

        const feedbackHistory = JSON.parse(fs.readFileSync(userLogFile, 'utf8'));

        finalPrompt = `
        You are an AI tutor assistant specialized in machine learning.
        
        Below is the student's performance history (feedback only). It may be short or detailed:
        ${JSON.stringify(feedbackHistory, null, 2)}
        
        Your task:
        - First, check if there is enough feedback to evaluate the student's understanding (at least 3 entries).
        - If there is enough data:
          - Analyze strengths and weaknesses.
          - Generate a **personalized revision plan** with structured titles and bullet points.
          - Focus on weak areas with practical suggestions.
          - Briefly mention strong areas and how to deepen them.
        - If there is NOT enough data:
          - Inform the student that their history is too limited for a personalized plan.
          - Propose a **short diagnostic test** (4–5 questions) to assess their level.
          - The questions should cover core ML concepts (regression, classification, overfitting, gradient descent, etc.).
        
        Always choose the correct option based on the feedback length.
        
        Expected format:
        
        ### Case 1: Personalized Revision Plan
        
        Title: Personalized Revision Plan
        
        - Weak Area 1: ...
          - Action steps / resources
        - Weak Area 2: ...
          - Exercises / reminders
        - Strength Area: ...
          - Quick review or deeper challenge
        
        ### Case 2: Diagnostic Test
        
        Title: Machine Learning Diagnostic Test
        
        The student has not interacted enough to generate a revision plan. Here's a test to assess their level:
        
        - Question 1: ...
        - Question 2: ...
        - Question 3: ...
        - Bonus: ...
        `;
        
      

  
  } else if (lowerIntent.includes("exam_creation")) {
    finalPrompt = `Speak in English. You're a highly qualified machine learning instructor tasked with creating **challenging and pedagogically sound exams** for students.

The student has submitted a request describing what they want to be tested on. Your goal is to create a **rigorous and coherent exam** based on their needs, ensuring the difficulty is appropriate for a university-level course in machine learning, deep learning or NLP.

Follow these guidelines:

1. **Understand the student's request**.
   - Identify key concepts or topics (e.g., regression, classification, CNNs, transformers).
   - Determine if practical coding is expected (e.g., with Python, PyTorch, scikit-learn).

2. **Structure the exam** as follows:
   - 4 to 6 questions total.
   - Mix of theory questions (definitions, reasoning, comparisons).
   - Practical or applied questions (pseudo-code, code snippets, debugging, short implementations).
   - Optional bonus question to challenge deeper understanding.

3. **Be precise and demanding**, like a real university exam:
   - Avoid vague or trivial questions.
   - Be explicit in instructions (e.g., “Implement from scratch”, “Compare method A and B with pros/cons”).
   - Vary question formats to test different skills (conceptual understanding, practical application, critique).


4. Do **not include answers**. Just return the exam questions.

Here is the student's request:
""" 
${userPrompt}
"""
`;
/*
Sur la feature correction_response_user y'a du travail car
En gros plus tard avec la mémoire de mon chatbot, quand ca sera correction_response_user, il va etre important
de regarder si il répond a une question précédement poser... Ca je dois l'ajouter dans le prompt avec possiblement
l'énoncer de la question a laquelle il répond. 
*/
  }else if (lowerIntent.includes("correction_student_input")) {
    finalPrompt = `Speak in English. You are an expert AI assistant and pedagogue helping a student. The student has just sent you a message. Your task is to analyze what they provided and give constructive feedback.
  
   Important: The student's message may contain **multiple elements**: a concept, an opinion, code, an error, or even a mix. You must identify each type of content and address it **individually**, with the right approach for each.
  
  ---
  
  **IF the student gives an affirmation, answer or concept (no code):**
  - Decide if the answer is correct or not.
  - Justify your verdict clearly.
  - Expand and clarify the concept to deepen the student's understanding.
  
  ---
  
  **IF the student provides code with no explanation:**
  - Analyze the code:
    - syntax or logic issues,
    - bad practices,
    - unclear parts.
  - Suggest improvements or refactoring ideas.
  - Do NOT rewrite the entire solution unless necessary.
  
  ---
  
   **IF the student shares a bug or error (with or without code):**
  - Identify the likely cause of the problem.
  - Explain what’s wrong and why it happens.
  - Suggest fixes, hypotheses, or debugging strategies.
  - Help the student understand, not just patch.
  
  ---
  
  **IF the student gives an instruction and expects you to write code (without trying themselves):**
  - Do NOT provide a full solution.
  - Give:
    - structured reasoning,
    - helpful steps,
    - pseudo-code if needed.
  - Encourage independent problem-solving.
  
  ---
  
  **IF the message combines several types (e.g., affirmation + code)**:
  - Treat each part **separately**.
  - Be precise, clear and educational in each case.
  
  ---
  
  Your response must be:
  - Structured and easy to read
  - Constructive and friendly
  - Focused on learning, not doing the work for the student
  
  Here is the student's message:
  """
  ${userPrompt}
  """`;
  }else if (lowerIntent.includes("other")) {
    finalPrompt = `
      Speak in English.

      You are a polite and focused AI assistant designed to help students understand and practice **machine learning**.

      If a user asks a question that is **not related to machine learning**, you must **refuse to answer**, without improvising or guessing.

      Instead, clearly explain:
      - That you are specialized in machine learning.
      - That your role is to support students in four main ways:
        1. Explaining ML concepts in a simple, clear way.
        2. Analyzing and correcting code or answers related to ML.
        3. Generating exam questions to help students practice.
        4. Building personalized revision plans based on the student's weaknesses.

      Be kind, but stay strict: do **not** answer off-topic questions.

      Here is the user's message:
      """
      ${userPrompt}
      """
      `;

  
  
  }else {
    finalPrompt = `Speak in English, Explain that you didn't understand the user's request correctly`;
  }
  

  return {finalPrompt, intent};
}

//-------------------------------------------------------------------------------------------//




//-------------------------------------------------------------------------------------------//
/*
  Author       : Jordi
  Date         : 2025-05-07
  Function     : logInteraction
  Description  : 
    This function logs interactions between a user and the chatbot.
    It is called after each user query is processed by the AI.

    Features:
    - Ignores interactions of type "exam_creation" (not relevant for memory tracking).
    - Calls the DeepSeek API to generate a short summary assessing the student's understanding.
      → The summary indicates whether the student understood the concept well, partially, or poorly,
        and highlights any confusion or missing knowledge.
    - Cleans the API response (removes Markdown formatting if present).
    - Stores the query, feedback summary, and intent in a user-specific JSON file
      located in `logs/<user_id>.json`.

    File format:
    [

        feedback: {
          understanding: "good" | "partial" | "poor",
          summary: String
        },

      ...
    ]
*/
async function logInteraction(userId, userPrompt, aiResponse, intent) {
  if (intent.includes("exam_creation")) return;

  // Prompt d’analyse succincte
  const analysisPrompt = `
  You are an AI tutor assistant.
  
  Here is a student's message and your response:
  
  STUDENT:
  "${userPrompt}"
  
  TUTOR RESPONSE:
  "${aiResponse}"
  
  Your task:
  - Evaluate if the student's message shows any misunderstanding or confusion.
  - If the student made a mistake or showed incomplete understanding, summarize it.
  - If the student clearly understood the concept, say so briefly.
  - If the message is too vague, irrelevant, or not related to machine learning understanding, return an empty JSON: {}
  
  Guidelines:
  - Keep the summary short and factual (max 3 lines).
  - Do NOT repeat the student's message.
  - Do NOT add any text outside the JSON block.
  
  Return only a strict JSON in one of these formats:
  
  Case 1: 
  {
    "understanding": "good" | "partial" | "poor",
    "summary": "One sentence summary of strengths and weaknesses."
  }
  
  Case 2 (no feedback possible):
  {}
  `;
  

  let memoryNote = {
    understanding: "unknown",
    summary: "No summary available."
  };

  try {
    let summaryText = await ApiCallDeepseek(analysisPrompt);
    summaryText = summaryText.replace(/```json|```/g, '').trim();
    memoryNote = JSON.parse(summaryText);
  } catch (err) {
    console.error("Erreur lors de l'analyse du feedback :", err);
  }

  // Nouveau format de log : uniquement feedback + timestamp
  const logEntry = {
    timestamp: new Date().toISOString(),
    feedback: memoryNote
  };

  // Nettoyer l'ID pour nom de fichier
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const userLogFile = path.join(LOGS_DIR, `${sanitizedUserId}.json`);

  try {
    let logs = [];
    if (fs.existsSync(userLogFile)) {
      const data = fs.readFileSync(userLogFile, 'utf8');
      logs = data ? JSON.parse(data) : [];
    }
    logs.push(logEntry);
    fs.writeFileSync(userLogFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(`Erreur lors de l'écriture dans le fichier ${userLogFile} :`, err);
  }
}


//-------------------------------------------------------------------------------------------//



//-------------------------------------------------------------------------------------------//

// This is the route to send POST requests, these are XLMs because wechat sends XLMs.
app.post('/wechat', async (req, res) => {
  const rawXml = req.body;

  xml2js.parseString(rawXml, async (err, result) => {
    if (err) {
      console.error("Erreur de parsing XML :", err);
      return res.status(400).send("Format XML invalide.");
    }

    try {
      const userPrompt = result.xml.Content?.[0];
      const fromUser = result.xml.FromUserName?.[0];   //Je dois utiliser ca comme clé pour enregistrer les message pour la mémoire 

      if (!userPrompt || !fromUser) {
        console.warn("Incomplete data in XML request.");
        return res.status(400).send("Invalid request.");
      }

      const { finalPrompt, intent } = await buildFinalPrompt(userPrompt, fromUser);

      if (!finalPrompt) {
        console.error("Prompt final empty.");
        return res.status(500).send("Processing error.");
      }

      const response = await ApiCallDeepseek(finalPrompt);

      logInteraction(fromUser, userPrompt, response, intent);

      console.log("Prompt final sent to AI:", finalPrompt);
      console.log("AI response:", response);

      res.status(200).send(response || "No answer.");

    } catch (e) {
      console.error("Processing error :", e);
      res.status(500).send("Internal error.");
    }
  });
});


//-------------------------------------------------------------------------------------------//



const TOKEN = 'mon_token_secret';

app.get('/wechat', (req, res) => {
  try {
    const { signature, timestamp, nonce, echostr } = req.query;
    console.log("WeChat validation received:", req.query);

    const arr = [TOKEN, timestamp, nonce].sort();
    const str = arr.join('');
    const hash = createHash('sha1').update(str).digest('hex');

    if (hash === signature) {
      console.log("Signature valid !");
      res.send(echostr);
    } else {
      console.warn("Invalid signature.");
      res.send("Unauthorized");
    }
  } catch (err) {
    console.error("Error in /wechat GET route:", err);
    res.status(500).send("Internal error");
  }
});

//--------------------------------------------------------------------------------------------//

/*

Partie RAG
Pour la récup de document comme je suis pas connecter a wechat je vais faire une route qui permet de charger un document depuis un dossier local.
Ensuite je coupe en chunk et transorme en embedding pour les stocker dans la base de données vectorielle.
Ensuite je dois trouver un moyen pour détecter quand enrichir les questions
Je transforme la requetes de l'utilisateur en embeding et je fais une comparaison cos avec mes embedings stocké
J'enrichie le prompt de l'ia pour la réponse de l'eleve

// */

// const DOCUMENTS_DIR = './documents';

// app.post('/upload-doc', async (req, res) => {
//   if (!isModelReady) {
//     return res.status(503).send("⏳ Embedding model not ready yet. Try again in a few seconds.");
//   }

//   const { filename } = req.query;
//   if (!filename) return res.status(400).send("Missing filename");

//   const filePath = path.join(DOCUMENTS_DIR, filename);
//   if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

//   try {
//     const fileContent = fs.readFileSync(filePath, 'utf8');
//     const chunks = splitIntoChunks(fileContent);
//     const embeddedChunks = [];

//     for (const chunk of chunks) {
//       const vector = await embedChunk(chunk);
//       embeddedChunks.push({ chunk, vector });
//     }

//     const outPath = path.join('./vectorstore', filename.replace(/\.[^/.]+$/, '') + '.json');
//     if (!fs.existsSync('./vectorstore')) fs.mkdirSync('./vectorstore');
//     fs.writeFileSync(outPath, JSON.stringify(embeddedChunks, null, 2));

//     res.send(`✅ Document "${filename}" traité et vectorisé (${embeddedChunks.length} chunks).`);

//   } catch (err) {
//     console.error("Error processing document:", err);
//     res.status(500).send("Internal error processing document");
//   }
// });




// // Text c'est le docuemnts que on a import et maxLength c'est la taille max de chaque chunk

// function splitIntoChunks(text, maxLength = 1000) {
//   const paragraphs = text.split(/\n\s*\n/); // split by double newlines
//   const chunks = [];
//   let current = '';

//   for (const para of paragraphs) {
//     if ((current + para).length <= maxLength) {
//       current += para + '\n\n';
//     } else {
//       if (current) chunks.push(current.trim());
//       current = para + '\n\n';
//     }
//   }
//   if (current) chunks.push(current.trim());
//   return chunks;
// }


// async function embedChunk(text) {
//   if (!embeddingPipeline) {
//     throw new Error("Embedding model not loaded");
//   }
//   const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
//   return output.data; // array of floats




// }






//-------------------------------------------------------------------------------------------//

// Run server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`);
});

//-------------------------------------------------------------------------------------------//