import express from 'express';  // using the express framework for my backend  
import bodyParser from 'body-parser'; // To help express understand HTTP requests
import xml2js from 'xml2js'; // To manage XLM requests
import OpenAI from "openai"; // for use deepseek
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
// import { pipeline } from '@xenova/transformers';
import axios from 'axios';
import { processWeChatImage } from './handleImages.js';
import { saveMessageToMemory } from './memoryManager.js';
import { loadMemory } from './memoryManager.js';


// id wx34853bb2155b4634

// secret 9b2db01b3561facd8184c5a2f2736083

// 9b2db01b3561facd8184c5a2f2736083

const APPID = 'wx34853bb2155b4634';       
const APPSECRET = '9b2db01b3561facd8184c5a2f2736083';     





const app = express();
const PORT = 80;

const LOG_FILE = './logs.json';


const LOGS_DIR = './logs';
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}




app.use(bodyParser.text({ type: '*/*' })); //this line indicates that the inputs to be read will be in XLM format

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


async function getAccessToken() {
  try {
    const response = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: APPID,
        secret: APPSECRET
      }
    });

    if (response.data.access_token) {
      return response.data.access_token;
    } else {
      console.error("Erreur récupération token :", response.data);
      return null;
    }
  } catch (error) {
    console.error("Erreur requête token :", error.message);
    return null;
  }
}

async function sendWeChatTextMessage(toUserOpenId, messageText) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error("Impossible d'envoyer le message : pas de token.");
    return;
  }

  try {
    const payload = {
      touser: toUserOpenId,
      msgtype: "text",
      text: {
        content: messageText
      }
    };

    const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`;
    const response = await axios.post(url, payload);

    if (response.data.errcode === 0) {
      console.log("✅ Message envoyé via API officielle");
    } else {
      console.error("❌ Erreur WeChat:", response.data);
    }
  } catch (error) {
    console.error("Erreur d'envoi WeChat:", error.message);
  }
}



//-------------------------------------------------------------------------------------------//

/*
The purpose of this function is to detect what type of request the user made.
By this way we can create a response more coherent with the user intention

Ici y'aura un travail d'entrainer un petit model pour detecter les intentions de l'utilisateur.

*/
async function buildFinalPrompt(userPrompt, userId)
 {

  const baseContext = `
    You are an expert in machine learning.

    Your behavior must follow these instructions:
    - Speak in clear English.
    - Do NOT use any emojis.
    - Always be concise and to the point.
    - Stay pedagogical and helpful.
    - Avoid long-winded explanations.
    - Use short, well-structured replies.
    - Stay focused on machine learning topics.
    - Your tone must be neutral, supportive, and professional.

    Your job is to help students:
    - Understand ML concepts,
    - Review code or answers,
    - Practice for exams,
    - Build personalized study plans.
    `;

  //Aller recup l'historique de l'user
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-_]/g, "_");

  // Charger les derniers messages
  const history = loadMemory(userId);
  let memoryContext = '';

  if (history.length > 0) {
    const messagesFormatted = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    memoryContext = `
      Previous conversation history between the student and you:

      ${messagesFormatted}

      Use this context only if the student refers to something already discussed above, or continues a previous topic.
      Otherwise, prioritize the current question.
        `;
  }

  // OCR context
  let ocrContext = '';
  try {
    const ocrPath = path.resolve('./ocr', `${sanitizedUserId}.json`);
    if (fs.existsSync(ocrPath)) {
      const logs = JSON.parse(fs.readFileSync(ocrPath, 'utf8'));
      const lastEntries = logs.slice(-3).map(entry => `- [${entry.timestamp}]\n${entry.text}`).join('\n\n');

      if (lastEntries.trim()) {
        ocrContext = `
        The following is a short history of **screenshot content** previously sent by the student (extracted via OCR). 

        Use this background if:
        - The student **explicitly references a screenshot** in their current question.
        - You think previous screenshots may contain **relevant context or information** that can support your response.

        Always prioritize the current user question, but feel free to draw from this history to clarify, complete, or support your reply if helpful.

        ${lastEntries}
        `;
      }
    }
  } catch (e) {
    console.warn('Could not load OCR context:', e);
  }


  const userLogFile = path.join(LOGS_DIR, `${sanitizedUserId}.json`);

  if (!fs.existsSync(userLogFile)) {
    return {
      finalPrompt: null,
      intent: "generate_study_plan_no_data"
    };
  }

  const feedbackHistory = JSON.parse(fs.readFileSync(userLogFile, 'utf8'));


  //First prompt to identify the nature of the user's request 
  const intentDetectionPrompt = `
      You are classifying user input into one or more intent categories.

      Here is the user input:
      "${userPrompt}"

      Choose one or more labels from the following list (and ONLY from this list):

      - explanation_notion_ml: The user asks for an explanation or definition of a machine learning concept.
      - correction_student_input: The user provides code, an answer, or a solution and expects feedback or improvement.
      - exam_creation: The user asks for practice questions, test problems, or quiz generation.
      - generate_study_plan: The user asks for a revision strategy or study plan.
      - follow_up: The user is continuing a previous exchange. This includes:
          - Short confirmations like “yes”, “continue”, “go on”
          - Clarifications, reformulations, or questions depending on earlier content
          - Indirect or vague messages that only make sense with context
      - other: The user is **explicitly** talking about a topic unrelated to machine learning (e.g., movies, politics, food, etc.).

      Strict classification rules:

      - Only use "other" if the topic is **clearly and explicitly** not about machine learning.
      - Do NOT assume something is unrelated based on lack of keywords.
      - If ambiguous, short, or unclear: assume it's **related to ML** by default, and classify it as "follow_up".
      - Prefer domain-specific categories unless you are certain the topic is off-topic.
      - Assume the user is here for machine learning help, unless they obviously say otherwise.

      Examples:

      "What's a decision tree?" → explanation_notion_ml  
      "Can you fix my code?" → correction_student_input  
      "Can you quiz me on CNNs?" → exam_creation  
      "Yes, go on" → follow_up  
      "Can you help me cook pasta?" → other  

      Return only the labels, comma-separated. No commentary.
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
  if (lowerIntent.includes("explanation_notion_ml") ) {
        finalPrompt = 
                `${baseContext}
                
                The student is asking for an explanation of a machine learning concept. Your job is to:
              - Explain the concept clearly and efficiently.
              - Use precise terminology, but stay understandable.
              - Give practical examples or analogies only if they improve clarity.
              - If the student's input contains confusion or incorrect statements, gently correct them and explain why.


              responds appropriately to the student

              ${ocrContext}

              ${memoryContext}

              Here is the full student request:
              """
              ${userPrompt}
              """`;
        }

  else if (lowerIntent.includes("generate_study_plan")) {


        finalPrompt = `

            ${baseContext}
            
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


            ${ocrContext}

            ${memoryContext}

            Here is the full student request:
            """
            ${userPrompt}
            """
            `;
        
          
      

  
  } else if (lowerIntent.includes("exam_creation")) {
    finalPrompt = 
            `
          ${baseContext}
            You're a highly qualified machine learning instructor tasked with creating **challenging and pedagogically sound exams** for students.

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

        Below is the student's performance history (feedback only). It may be short or detailed:
        If the student asks you to, or if you think it's relevant, you can use the student's weaknesses as the basis for the exam.
        ${JSON.stringify(feedbackHistory, null, 2)}

        ${ocrContext}

        ${memoryContext}

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
    finalPrompt = `
        ${baseContext}
        
        You are an expert AI assistant and pedagogue helping a student. The student has just sent you a message. Your task is to analyze what they provided and give constructive feedback.
      
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


      ${ocrContext}

      ${memoryContext}
      
      Here is the student's message:
      """
      ${userPrompt}
      """`;
  }
  else if (lowerIntent.includes("follow_up")) {
    finalPrompt = `
      ${baseContext}

      The student is continuing a previous exchange. Here is the recent conversation history:

      ${memoryContext}

      ${ocrContext}

      Your task:
      - Analyze the previous exchange and the new student message.
      - If the student is asking to continue, clarify, or go deeper, do not repeat what was already said.
      - Instead, **add value**:
        - Explain the **prediction logic** in detail (e.g., how [29, 24] is classified)
        - Explain the **intuition** behind the algorithm (e.g., how k-NN decides class)
        - Provide edge case insights or tips
        - If unclear, ask the student what they want to know more about

      Student’s new message:
      """
      ${userPrompt}
      """
    `;
  
  }else if (lowerIntent.includes("other")) {
    finalPrompt = `
      ${baseContext}

      You are a helpful and polite AI assistant specialized in **machine learning**.

      Your behavior depends on the user’s intent:

      ---

      **Case 1 — Casual or polite message (e.g., greetings, small talk, thank you):**
      - Reply in a friendly and welcoming tone.
      - Acknowledge the user's message (e.g., "Hello!", "Nice to see you!" or "You're welcome!").
      - Gently guide the user toward your actual purpose: helping with machine learning.
      - Example: "Hi there! I'm your machine learning assistant. What would you like to study today?"

      ---

      **Case 2 — User asks something that is NOT related to machine learning:**
      - Do **not** try to answer the question.
      - Kindly explain that you are focused solely on helping with machine learning topics.
      - Clearly list the four types of things you can help with:
        1. Explaining ML concepts
        2. Reviewing student answers or code
        3. Generating ML exam questions
        4. Building personalized study plans

      ---

      Always be friendly, but stay focused on your mission.


      ${ocrContext}

      ${memoryContext}

      Here is the user’s message:
      """
      ${userPrompt}
      """
      `;
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

  Return only one of these:
  {
    "understanding": "good" | "partial" | "poor",
    "summary": "Short feedback."
  }

  Or just: {}
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

  const logEntry = {
    timestamp: new Date().toISOString(),
    feedback: memoryNote
  };

  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const userLogFile = path.join(LOGS_DIR, `${sanitizedUserId}.json`);

  try {
    let logs = [];
    if (fs.existsSync(userLogFile)) {
      const data = fs.readFileSync(userLogFile, 'utf8');
      logs = data ? JSON.parse(data) : [];

      // 🔁 Garder seulement les logs < 24h
      const now = new Date();
      logs = logs.filter(entry => {
        const entryTime = new Date(entry.timestamp);
        const hoursDiff = (now - entryTime) / (1000 * 60 * 60);
        return hoursDiff < 24;
      });
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
  console.log(" Requête XML brute reçue de WeChat :\n", rawXml);

  // On répond tout de suite à WeChat
  res.status(200).send('Message received. Processing in progress...');

  xml2js.parseString(rawXml, async (err, result) => {
    if (err) {
      console.error("Erreur de parsing XML :", err);
      return;
    }

    try {
      const msgType = result.xml.MsgType?.[0]; // 'text', 'image', etc.
      const fromUser = result.xml.FromUserName?.[0];
      const toUser = result.xml.ToUserName?.[0];
      const now = Math.floor(Date.now() / 1000);

      if (!msgType || !fromUser || !toUser) {
        console.warn("Données XML incomplètes.");
        return;
      }

      if (msgType === 'text') {
        const userPrompt = result.xml.Content?.[0];

        const { finalPrompt, intent } = await buildFinalPrompt(userPrompt, fromUser);
        const response = await ApiCallDeepseek(finalPrompt);
        await logInteraction(fromUser, userPrompt, response, intent);
        saveMessageToMemory(fromUser, "user", userPrompt);
        saveMessageToMemory(fromUser, "assistant", response);
        console.log("Réponse Deepseek :", response);

        await sendWeChatTextMessage(fromUser, response); // Envoi réel du message à l'utilisateur
      }

      else if (msgType === 'image') {
        const imageUrl = result.xml.PicUrl?.[0];
        processWeChatImage(imageUrl, fromUser)
          .then(text => {
            if (text) {
              console.log("OCR terminé pour image :", text.slice(0, 100));
            }
          });

        await sendWeChatTextMessage(fromUser, "I got the picture! Tell me what you want me to do with it.");
      }

    } catch (e) {
      console.error("Erreur dans le traitement :", e);
    }
  });
});




//--------------------------------------------------------------------------------------------//

/*

Gérer le RAG
-> Je peux pas envoyer de document style PDF etc ducoup ca sera via des screens, donc on récupere
une image on la traduit en texte, on essaye de comprendre le contexte derrière tout ca.
*/




app.get('/', (req, res) => {
  res.send('Serveur Express en ligne');
});



//-------------------------------------------------------------------------------------------//

// Run server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`);
});

//-------------------------------------------------------------------------------------------//