const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

admin.initializeApp();

// Initialize OpenAI only when function is called
function getOpenAI() {
  return new OpenAI({
    apiKey: functions.config().openai.key
  });
}

// Helper: Get system mode
function getSystemMode(modeId) {
  const systemModes = {
    'timelapse_build': {
      name: { th: 'Time-lapse สร้างบ้าน', en: 'Time-lapse Build', zh: '延时建造' },
      sceneBlueprint: [
        { order: 1, description: 'Foundation', duration: 10 },
        { order: 2, description: 'Frame construction', duration: 10 },
        { order: 3, description: 'Completed house', duration: 10 }
      ]
    }
    // Add more system modes here
  };
  return systemModes[modeId];
}

// Function: Generate Prompts (Auth Required)
exports.generatePrompts = functions
  .runWith({ secrets: ['OPENAI_API_KEY'] })
  .https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    const { projectId, modeId } = data;
    const userId = context.auth.uid;

    try {
      // Get project data
      const projectDoc = await admin.firestore()
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .get();

      if (!projectDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Project not found');
      }

      const project = projectDoc.data();

      // Get mode data
      let mode;
      if (project.modeType === 'system') {
        mode = getSystemMode(modeId);
      } else if (project.modeType === 'custom') {
        const modeDoc = await admin.firestore()
          .collection('users').doc(userId)
          .collection('customModes').doc(modeId)
          .get();
        mode = modeDoc.data();
      } else if (project.modeType === 'marketplace') {
        const modeDoc = await admin.firestore()
          .collection('marketplaceModes').doc(modeId)
          .get();
        mode = modeDoc.data().mode;
      }

      if (!mode) {
        throw new functions.https.HttpsError('not-found', 'Mode not found');
      }

      // Call OpenAI
      const openai = new OpenAI({ apiKey: functions.config().openai.key });
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a video content planner. Generate detailed scene prompts for AI video generation. Return JSON only.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              concept: project.concept,
              scenes: project.scenes,
              aspect: project.aspect,
              modeBlueprint: mode.sceneBlueprint
            })
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      let content = response.choices[0].message.content;
      // Basic cleanup if markdown backticks are included
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();

      const result = JSON.parse(content);
      return {
        prompts: result.prompts,
        caption: result.caption,
        hashtags: result.hashtags
      };
    } catch (error) {
      console.error('Error generating prompts:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Function: Reset Daily Post Counts (Scheduled 00:00 BKK)
exports.resetDailyPostCounts = functions.pubsub.schedule('0 0 * * *')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    const batch = admin.firestore().batch();
    const usersSnapshot = await admin.firestore().collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const accountsSnapshot = await admin.firestore()
        .collection('users').doc(userDoc.id)
        .collection('accounts').get();

      for (const accountDoc of accountsSnapshot.docs) {
        batch.update(accountDoc.ref, { postsToday: 0 });
      }
    }

    await batch.commit();
    console.log('Daily post counts reset');
  });

// Function: Seed Database (HTTP Utility)
exports.seedDatabase = functions.https.onRequest(async (req, res) => {
  try {
    const userId = 'user_demo_123';
    const batch = admin.firestore().batch();

    // 1. Create User
    const userRef = admin.firestore().collection('users').doc(userId);
    batch.set(userRef, {
      email: 'demo@example.com',
      displayName: 'Demo User',
      role: 'admin',
      subscription: {
        plan: 'pro',
        status: 'active',
        currentPeriodEnd: admin.firestore.FieldValue.serverTimestamp()
      },
      language: 'th',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Create Account
    const accountRef = userRef.collection('accounts').doc('youtube_main');
    batch.set(accountRef, {
      platform: 'youtube',
      accountName: 'My Channel',
      profilePath: '',
      dailyPostLimit: 20,
      minIntervalMinutes: 20,
      postsToday: 0,
      lastPostTime: 0,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 3. Create Project
    const projectRef = userRef.collection('projects').doc('project_demo');
    batch.set(projectRef, {
      name: 'Demo Project',
      concept: 'Architecture',
      scenes: 3,
      aspect: '9:16',
      modeType: 'system',
      modeId: 'timelapse_build',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 4. Create Timeslot
    const date = new Date().toISOString().split('T')[0];
    const timeslotRef = admin.firestore().collection('timeslots').doc(`${date}_${userId}`);
    batch.set(timeslotRef, {
      date: date,
      userId: userId,
      slots: []
    }, { merge: true });

    // 5. Create Marketplace Mode
    const marketModeRef = admin.firestore().collection('marketplaceModes').doc('mode_demo');
    batch.set(marketModeRef, {
      creatorId: userId,
      creatorName: 'Admin',
      price: 0,
      publishedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    res.json({ success: true, message: 'Database seeded successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Function: Generate Speech (Secure TTS Proxy)
exports.generateSpeech = functions
  .runWith({ secrets: [] }) // Note: TTS usually uses default credentials if enabled in GCP
  .https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { text, voiceParams } = data;
    if (!text) {
      throw new functions.https.HttpsError('invalid-argument', 'Text is required');
    }

    try {
      const client = new TextToSpeechClient();
      const request = {
        input: data.ssml ? { ssml: data.ssml } : { text: text },
        voice: voiceParams || { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' },
        audioConfig: {
          audioEncoding: 'MP3'
        },
      };

      const [response] = await client.synthesizeSpeech(request);
      return { audioContent: response.audioContent.toString('base64') };
    } catch (error) {
      console.error('Error generating speech:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Helper: Normalize Percentages (Auto-Correction)
function normalizePercentages(items) {
  if (!items || items.length === 0) return [];

  let total = 0;
  // 1. Initial Pass: Parse integers
  items.forEach(item => {
    item.percentage = parseInt(item.percentage) || 0;
    total += item.percentage;
  });

  // 2. Safety Valve: If total is 0 or wildly invalid (e.g. > 110 or < 90), reset to equal distribution
  // We use a loose threshold to allow minor user errors to be fixed by math, but major ones get a hard reset.
  if (total < 90 || total > 110) {
    const split = Math.floor(100 / items.length);
    let remainder = 100 - (split * items.length);

    items.forEach(item => {
      item.percentage = split;
      if (remainder > 0) {
        item.percentage += 1;
        remainder--;
      }
    });
  } else {
    // 3. Precise Adjustment: If close to 100 (e.g. 99 or 101), just fix the last item
    if (total !== 100) {
      const diff = 100 - total;
      items[items.length - 1].percentage += diff;
    }
  }

  return items;
}

// Function: Analyze Mode (AI Critique + TTS)
exports.analyzeMode = functions
  .runWith({ secrets: [], timeoutSeconds: 300, memory: '1GB' }) // Fix Timeout & Memory for heavy AI tasks
  .https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    // Support both direct object (if called directly) or nested via Callable .data
    const input = data.modeData || (data.data && data.data.modeData) || data;
    let { name, description, category, systemInstruction, variables, blocks } = input;

    // *If input is still just a prompt string (legacy fallback), handle it?*
    // Ideally we force the frontend to send the object now. But let's check.
    if (!blocks && data.promptText) {
      // Fallback for direct promptText calls (Legacy) - Just wrap it
      console.log("⚠️ Legacy promptText received. Bypassing percentage logic.");
      // We can't do percentage logic here, so strictly we should just proceed or fail.
      // Let's assume for this task we are moving to structured data.
    }

    // 1. Backend Normalization (Auto-Correct Logic)
    if (blocks && Array.isArray(blocks)) {
      // Level 1: Sequences
      blocks = normalizePercentages(blocks);

      // Level 2: Steps within Sequences
      blocks.forEach(block => {
        if (block.evolution && Array.isArray(block.evolution)) {
          block.evolution = normalizePercentages(block.evolution);
        }
      });
    }

    try {
      // 2. Construct Prompt from Structured Data (NEW: No rawPrompt - only block titles)
      let structureText = "";
      if (blocks) {
        blocks.forEach((block, i) => {
          const seqPercent = block.sequencePercentage || block.percentage || 0;
          structureText += `Scene ${i + 1}: ${block.title} (${seqPercent}%)\n`;
          // Note: evolution/steps still exist for timing but no rawPrompt
          if (block.evolution && block.evolution.length > 1) {
            block.evolution.forEach((step, j) => {
              const stepPercent = step.stepPercentage || step.percentage || 0;
              structureText += `  - Step ${j + 1}: [${stepPercent}% of scene time]\n`;
            });
          }
        });
      }

      const fullPrompt = `
      Title: ${name}
      Category: ${category || 'Cinematic / Movie'}
      Description: ${description}
      Instruction: ${systemInstruction}
      Variables: ${variables ? variables.map(v => v.name).join(', ') : 'None'}
      
      Blueprint / Timeline:
      ${structureText}
      
      User Original Prompt (Legacy): ${data.promptText || ''}
      `.trim();

      console.log("Normalized Payload:", JSON.stringify(blocks, null, 2));

      // 3. AI Analysis
      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are Charon, a world-class AI Mode Architect Critic.
            Speak Thai. CRITICAL RULE: You MUST use punctuation to control the audio flow for Google TTS.
            
            Analyze the user's Mode Blueprint. This is a TEMPLATE for video generation.
            
            [🎯 WHAT YOU ARE ANALYZING]
            - Mode = Template with scene titles (NOT full scripts)
            - Scene titles use [TOPIC] placeholder (will be replaced by Content Queue later)
            - Expander system will add cinematic details later
            - Focus on: STRUCTURE, PACING, SCENE FLOW
            
            [DYNAMIC PERSONA: WORLD-CLASS STRUCTURE CRITIC]
            You are a Visionary Producer critiquing the TEMPLATE DESIGN:
            - SCORE 0-4: Poor structure, confusing flow, bad pacing
            - SCORE 5-7: Decent structure, room for improvement
            - SCORE 8-10: Excellent narrative arc, perfect pacing

            [TTS FORMATTING RULES - CRITICAL]
            - DO NOT USE DIGITS (0-9). SPELL OUT ALL NUMBERS IN THAI.
            - Example: "80%" -> "แปดสิบเปอร์เซ็นต์"

            [WHAT TO CRITIQUE]
            1. Scene count - เพียงพอสำหรับเล่าเรื่องหรือไม่?
            2. Scene titles - ชัดเจน มีความหมายหรือไม่?
            3. Percentage allocation - สัดส่วนเวลาสมเหตุสมผลหรือไม่?
            4. Narrative arc - มี Hook, Rising Action, Climax หรือไม่?
            5. System Instruction - ชัดเจนพอให้ AI เข้าใจหรือไม่?

            MANDATORY SECTION: "🚑 คำแนะนำ:"
            - จำนวนฉากที่แนะนำ
            - ปรับสัดส่วนเวลาอย่างไร
            - ชื่อฉากที่ควรเปลี่ยน
            
            Output a JSON object:
            {
              "score": integer (0-10),
              "script": "..."
            }
            CRITICAL: Output strictly VALID JSON. MINIFY (single line). Use literal '\\n' for newlines.
            `
          },
          {
            role: 'user',
            content: `Analyze this Mode: ${fullPrompt}`
          }
        ],
        temperature: 0.7,
      });

      let content = completion.choices[0].message.content;

      // 1. Remove Markdown Wrappers
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();

      // 2. Extract strictly from first '{' to last '}'
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        content = content.substring(firstBrace, lastBrace + 1);
      }

      // 3. DEBUG LOGGING (CRITICAL)
      console.log("CLEANED_JSON_PAYLOAD:", content);

      const result = JSON.parse(content);

      // 2. Generate Speech for the Script (CHUNKED to avoid limit)
      const ttsClient = new TextToSpeechClient();
      const chunks = chunkText(result.script, 180); // Smart Splitter (limit 180)
      const audioBuffers = [];

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        const ttsRequest = {
          input: { text: chunk },
          voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' },
          audioConfig: { audioEncoding: 'MP3' },
        };
        const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
        if (response.audioContent) {
          audioBuffers.push(response.audioContent);
        }
      }

      // Concatenate all audio buffers
      const finalAudio = Buffer.concat(audioBuffers);

      return {
        score: parseInt(result.score) || 0, // Enforce Integer
        script: result.script,
        audioContent: finalAudio.toString('base64')
      };

    } catch (error) {
      console.error('Error analyzing mode:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// --- HELPER: Text Chunking ---
// --- HELPER: Smart Splitter for Lossless TTS ---
function chunkText(text, maxLength) {
  if (!text) return [];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Priority 1: Split at last Punctuation within limit
    // We look for . ! ? or newline
    let splitIndex = -1;
    const punctuationRegex = /[.!?\n]/;

    // Search backwards from limit
    for (let i = maxLength; i >= 0; i--) {
      if (punctuationRegex.test(remaining[i])) {
        splitIndex = i + 1; // Include the punctuation
        break;
      }
    }

    // Priority 2: Split at last Space within limit (if no punctuation found)
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex !== -1) splitIndex += 1; // Include space (or split after it)
    }

    // Priority 3: Hard limit (Force split)
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    // Extract chunk
    const chunk = remaining.substring(0, splitIndex).trim();
    if (chunk) chunks.push(chunk);

    // Update remaining text
    remaining = remaining.substring(splitIndex).trim();
  }

  // Add the last piece
  if (remaining) chunks.push(remaining);

  return chunks;
}

// --- 3. Mode Architect (Consultant) - AI Story Director ---

// ============================================
// SHARED HELPER: Per-Scene Expansion with Episode Topic
// Used by: testPromptPipeline, scheduleJobs
// This ensures Generate Test and Production use IDENTICAL logic
// Enhanced: Emotional Arc, Transition Hints, Sound Design, Visual Consistency, Scene Memory, Dialogue Markers
// ============================================
// ============================================
// CATEGORY DIALOGUE RULES - Different categories have different dialogue patterns
// ============================================
const CATEGORY_DIALOGUE_RULES = {
  "Cinematic / Movie": {
    style: "dramatic dialogue between characters",
    dialoguePerScene: "2-5 lines based on emotional arc",
    type: "conversation, monologue, or reaction"
  },
  "Short Film / Story": {
    style: "storytelling dialogue",
    dialoguePerScene: "2-4 lines per scene",
    type: "narrative conversation"
  },
  "Product Showcase / Commercial": {
    style: "minimal or no dialogue",
    dialoguePerScene: "0-1 lines",
    type: "brief narration or tagline only"
  },
  "Real Estate / Architecture": {
    style: "no dialogue",
    dialoguePerScene: "0 lines",
    type: "visual showcase only"
  },
  "Vlog / Lifestyle": {
    style: "casual monologue to camera",
    dialoguePerScene: "2-4 lines per scene",
    type: "talking to camera, personal sharing"
  },
  "Time-lapse / Hyper-lapse": {
    style: "no dialogue",
    dialoguePerScene: "0 lines",
    type: "music and ambient sounds only"
  },
  "Documentary / News": {
    style: "interview or narration",
    dialoguePerScene: "1-3 lines per scene",
    type: "voiceover, interview clips, or narration"
  },
  "How-to / Tutorial": {
    style: "instructional monologue",
    dialoguePerScene: "3-5 lines per scene",
    type: "step-by-step explanation"
  },
  "Relaxation / Lo-fi / ASMR": {
    style: "no dialogue",
    dialoguePerScene: "0 lines",
    type: "ambient sounds and soft music only"
  }
};

// ============================================
// SHARED HELPER: Expand Scenes with Topic (STORY-FIRST APPROACH)
// Step 1: Create Full Story with all dialogues
// Step 2: Split into Scene Prompts
// ============================================
async function expandScenesWithTopic(params) {
  const {
    rawScenes,
    expanderBlocks,
    episodeTopic,
    episodeDesc,
    characters,
    sceneDuration = 8,
    modeCategory,
    systemInstruction
  } = params;

  const openai = getOpenAI();
  const totalScenes = rawScenes.length;
  const totalDuration = totalScenes * sceneDuration;

  // ============================================
  // DETAILED LOGGING
  // ============================================
  console.log(`🔧 expandScenesWithTopic: STORY-FIRST APPROACH`);
  console.log(`   📊 Total Scenes: ${totalScenes}`);
  console.log(`   📊 Duration per Scene: ${sceneDuration}s`);
  console.log(`   📊 Total Duration: ${totalDuration}s`);
  console.log(`   📊 Episode Topic: "${episodeTopic || 'No Episode'}"`);
  console.log(`   📊 Category: "${modeCategory || 'Cinematic / Movie'}"`);
  
  // Log Expander Blocks
  console.log(`   📊 Expander Blocks: ${expanderBlocks?.length || 0}`);
  if (expanderBlocks && expanderBlocks.length > 0) {
    expanderBlocks.forEach((b, i) => {
      console.log(`      ${i + 1}. "${b.name}" → ${(b.instruction || 'NO INSTRUCTION').substring(0, 80)}...`);
    });
  }
  
  // Log Characters
  console.log(`   📊 Characters: ${characters?.length || 0}`);
  if (characters && characters.length > 0) {
    characters.forEach((c, i) => {
      console.log(`      ${i + 1}. "${c.name}" → ${(c.visualDescription || c.description || 'NO DESC').substring(0, 80)}...`);
    });
  }

  // ============================================
  // LANGUAGE DETECTION from Expander Blocks
  // ============================================
  let detectedLanguage = 'English';
  const languageKeywords = {
    'อีสาน': 'ภาษาอีสาน (Isan Thai dialect)',
    'ไทย': 'ภาษาไทย (Thai)',
    'thai': 'ภาษาไทย (Thai)',
    'english': 'English',
    'อังกฤษ': 'English',
    'ญี่ปุ่น': 'ภาษาญี่ปุ่น (Japanese)',
    'japanese': 'ภาษาญี่ปุ่น (Japanese)',
    'จีน': 'ภาษาจีน (Chinese)',
    'chinese': 'ภาษาจีน (Chinese)'
  };

  if (expanderBlocks && expanderBlocks.length > 0) {
    for (const block of expanderBlocks) {
      const blockNameLower = (block.name || '').toLowerCase();
      const blockInstruction = (block.instruction || '').toLowerCase();
      for (const [keyword, language] of Object.entries(languageKeywords)) {
        if (blockNameLower.includes(keyword.toLowerCase()) || blockInstruction.includes(keyword.toLowerCase())) {
          detectedLanguage = language;
          console.log(`   🌐 Detected Language: "${block.name}" → ${language}`);
          break;
        }
      }
    }
  }

  // ============================================
  // BUILD CONTEXT STRINGS (Priority Order)
  // ============================================
  
  // 🔴 PRIORITY 1: Expander Block Instructions (HIGHEST)
  const expanderInstructions = expanderBlocks && expanderBlocks.length > 0
    ? expanderBlocks.map((b, i) => `${i + 1}. [${b.name}]: ${b.instruction || b.description || ''}`).join('\n')
    : 'Standard cinematic style';

  // 🟠 PRIORITY 2: Mode Structure (Scene titles and emotional arc)
  const modeStructure = rawScenes.map((scene, i) => {
    const position = i / (totalScenes - 1 || 1);
    let arc = 'RISING';
    if (position <= 0.2) arc = 'INTRODUCTION';
    else if (position <= 0.4) arc = 'RISING';
    else if (position <= 0.6) arc = 'CLIMAX';
    else if (position <= 0.8) arc = 'FALLING';
    else arc = 'RESOLUTION';
    return `Scene ${i + 1} (${arc}): ${scene.blockTitle || 'Untitled'} - ${scene.sceneInstruction || scene.visualPrompt || ''}`;
  }).join('\n');

  // 🟡 PRIORITY 3: Character Context
  const characterContext = characters && characters.length > 0
    ? characters.map(c => `- ${c.name}: ${c.visualDescription || c.description || 'N/A'}`).join('\n')
    : 'No specific characters defined';

  // Category Dialogue Rules
  const dialogueRules = CATEGORY_DIALOGUE_RULES[modeCategory] || CATEGORY_DIALOGUE_RULES["Cinematic / Movie"];
  console.log(`   📊 Dialogue Rules: ${dialogueRules.style} (${dialogueRules.dialoguePerScene})`);

  try {
    // ============================================
    // STEP 1: STORY CREATOR - สร้างเนื้อเรื่องทั้งหมดก่อน
    // ============================================
    console.log(`\n   📖 STEP 1: Creating Full Story...`);

    const storySystemPrompt = `You are a professional screenwriter. Create a complete story with connected dialogues.

=== 🔴 PRIORITY 1: EXPANDER RULES (MUST FOLLOW STRICTLY) ===
${expanderInstructions}

⚠️ These Expander rules are MANDATORY. Every dialogue, every scene MUST follow these rules.
If Expander says "ภาษาอีสาน" → ALL dialogues must be in Isan Thai dialect.
If Expander says "horror style" → ALL scenes must have horror atmosphere.

=== 🟠 PRIORITY 2: MODE STRUCTURE (Scene breakdown) ===
${modeStructure}

=== 🟡 PRIORITY 3: CHARACTERS ===
${characterContext}

=== 🟢 PRIORITY 4: EPISODE CONTEXT ===
Topic: "${episodeTopic || 'Untitled'}"
Description: ${episodeDesc || 'N/A'}
Category: ${modeCategory || 'Cinematic'}

=== DIALOGUE RULES (Category: ${modeCategory}) ===
Style: ${dialogueRules.style}
Amount per scene: ${dialogueRules.dialoguePerScene}
Type: ${dialogueRules.type}

=== VIDEO CONSTRAINTS ===
Total Duration: ${totalDuration} seconds (${totalScenes} scenes × ${sceneDuration}s each)
Language for ALL dialogues: ${detectedLanguage}

=== YOUR TASK ===
Write a COMPLETE STORY with:
1. Full narrative arc (beginning → middle → end)
2. ALL character dialogues that flow naturally and connect scene to scene
3. Emotional progression matching the scene structure
4. Every dialogue must be in ${detectedLanguage} and follow Expander rules

=== OUTPUT FORMAT (JSON) ===
{
  "storyTitle": "Title of the story",
  "storySynopsis": "Brief 2-3 sentence summary",
  "fullDialogueScript": [
    {
      "sceneNumber": 1,
      "emotionalArc": "INTRODUCTION",
      "setting": "Location and atmosphere",
      "dialogues": [
        { "character": "Character Name", "line": "Dialogue in ${detectedLanguage}" }
      ],
      "visualAction": "What happens visually",
      "audioMood": "Sound/music mood"
    }
  ]
}`;

    const storyResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: storySystemPrompt },
        { role: 'user', content: `Create a complete story for ${totalScenes} scenes about "${episodeTopic}". Make sure all dialogues connect naturally from scene to scene.` }
      ],
      temperature: 0.8,
      max_tokens: 6000,
      response_format: { type: 'json_object' }
    });

    let storyContent = storyResponse.choices[0]?.message?.content?.trim() || '{}';
    let storyData;
    
    try {
      storyData = JSON.parse(storyContent);
      console.log(`   ✅ Story created: "${storyData.storyTitle || 'Untitled'}"`);
      console.log(`   📄 Synopsis: ${(storyData.storySynopsis || '').substring(0, 100)}...`);
      console.log(`   📄 Dialogue scenes: ${storyData.fullDialogueScript?.length || 0}`);
    } catch (parseErr) {
      console.error(`   ❌ Story parse error:`, parseErr.message);
      storyData = { fullDialogueScript: [] };
    }

    // ============================================
    // STEP 2: SCENE SPLITTER - แบ่งเป็น Video Prompts
    // ============================================
    console.log(`\n   🎬 STEP 2: Splitting into Scene Prompts...`);

    const splitSystemPrompt = `You are a video prompt specialist. Convert story scenes into AI video generation prompts.

=== STORY DATA ===
Title: ${storyData.storyTitle || episodeTopic}
Synopsis: ${storyData.storySynopsis || episodeDesc}

=== 🔴 EXPANDER RULES (MUST APPLY TO EVERY PROMPT) ===
${expanderInstructions}

=== CHARACTERS (Use exact visualDescription) ===
${characterContext}

=== VIDEO SPEC ===
Duration per scene: ${sceneDuration} seconds
Style: ${modeCategory || 'Cinematic'}
Language: ${detectedLanguage}

=== YOUR TASK ===
Convert each scene from the story into a video prompt.
Each prompt must:
1. Include SETTING (from story)
2. Include MAIN SUBJECT (character with visualDescription)
3. Include SHOT LIST (3-4 camera shots for ${sceneDuration}s)
4. Include DIALOGUE (exactly from the story, in ${detectedLanguage})
5. Follow ALL Expander rules

=== OUTPUT FORMAT (JSON) ===
{
  "scenes": [
    {
      "sceneNumber": 1,
      "prompt": "VIDEO SPEC: Duration ${sceneDuration}s | Style ${modeCategory} | [Expander camera/lighting]\\nSETTING: [from story]\\nMAIN SUBJECT: [character + visualDescription]\\nSHOT LIST: 1. [shot] 2. [shot] 3. [shot]\\nDIALOGUE: [character]: \\"[line in ${detectedLanguage}]\\"\\nAVOID: No extra characters, no distortion",
      "audioDescription": "Sound and music description"
    }
  ]
}`;

    const dialogueScenes = storyData.fullDialogueScript || [];
    const splitUserContent = `Convert these ${dialogueScenes.length} story scenes into video prompts:\n${JSON.stringify(dialogueScenes, null, 2)}`;

    const splitResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: splitSystemPrompt },
        { role: 'user', content: splitUserContent }
      ],
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    });

    let splitContent = splitResponse.choices[0]?.message?.content?.trim() || '{}';
    let splitData;

    try {
      splitData = JSON.parse(splitContent);
      console.log(`   ✅ Prompts generated: ${splitData.scenes?.length || 0} scenes`);
    } catch (parseErr) {
      console.error(`   ❌ Split parse error:`, parseErr.message);
      splitData = { scenes: [] };
    }

    // ============================================
    // MAP RESULTS TO OUTPUT FORMAT
    // ============================================
    const allExpandedPrompts = [];
    const generatedScenes = splitData.scenes || [];

    for (let i = 0; i < totalScenes; i++) {
      const scene = rawScenes[i];
      const generated = generatedScenes.find(s => s.sceneNumber === i + 1) || generatedScenes[i] || {};
      
      const position = i / (totalScenes - 1 || 1);
      let emotionalArc = 'RISING';
      if (position <= 0.2) emotionalArc = 'INTRODUCTION';
      else if (position <= 0.4) emotionalArc = 'RISING';
      else if (position <= 0.6) emotionalArc = 'CLIMAX';
      else if (position <= 0.8) emotionalArc = 'FALLING';
      else emotionalArc = 'RESOLUTION';

      const hasPrompt = generated.prompt && generated.prompt.length > 50;
      if (!hasPrompt) {
        console.log(`   ⚠️ Scene ${i + 1}: No prompt generated, using fallback`);
      }

      allExpandedPrompts.push({
        sceneNumber: i + 1,
        englishPrompt: generated.prompt || scene.visualPrompt || scene.rawPrompt || scene.blockTitle || `Scene ${i + 1}`,
        originalPrompt: scene.visualPrompt || scene.rawPrompt || scene.blockTitle,
        audioDescription: generated.audioDescription || scene.audioAmbience || 'Ambient sounds',
        cameraAngle: scene.cameraAngle || 'wide',
        blockTitle: scene.blockTitle || `Scene ${i + 1}`,
        emotionalArc,
        storyConnected: hasPrompt
      });
    }

    const successCount = allExpandedPrompts.filter(p => p.storyConnected).length;
    console.log(`\n🏁 STORY-FIRST COMPLETE: ${successCount}/${totalScenes} scenes with connected story`);
    
    return allExpandedPrompts;

  } catch (err) {
    // ============================================
    // ERROR HANDLING - Graceful Fallback
    // ============================================
    console.error(`   ❌ Story-First approach failed:`, err.message);
    console.log(`   🔄 Falling back to basic prompts...`);
    
    const fallbackPrompts = [];
    for (let i = 0; i < totalScenes; i++) {
      const scene = rawScenes[i];
      const position = i / (totalScenes - 1 || 1);
      let emotionalArc = 'RISING';
      if (position <= 0.2) emotionalArc = 'INTRODUCTION';
      else if (position <= 0.4) emotionalArc = 'RISING';
      else if (position <= 0.6) emotionalArc = 'CLIMAX';
      else if (position <= 0.8) emotionalArc = 'FALLING';
      else emotionalArc = 'RESOLUTION';

      fallbackPrompts.push({
        sceneNumber: i + 1,
        englishPrompt: scene.visualPrompt || scene.rawPrompt || scene.blockTitle || `Scene ${i + 1}`,
        originalPrompt: scene.visualPrompt || scene.rawPrompt || scene.blockTitle,
        audioDescription: scene.audioAmbience || 'Ambient sounds',
        cameraAngle: scene.cameraAngle || 'wide',
        blockTitle: scene.blockTitle || `Scene ${i + 1}`,
        emotionalArc,
        failed: true
      });
    }
    
    return fallbackPrompts;
  }
}

// ============================================
// SHARED HELPER: Generate Titles and Tags for all platforms
// ============================================
async function generateTitlesAndTags(params) {
  const {
    episodeTopic,
    episodeDesc,
    modeCategory,
    expandedPrompts
  } = params;

  const openai = getOpenAI();

  const prompt = `You are a social media expert. Generate engaging titles and tags for a video.

=== VIDEO TOPIC ===
Title: "${episodeTopic}"
Description: ${episodeDesc || 'N/A'}
Category: ${modeCategory || 'Entertainment'}
Number of Scenes: ${expandedPrompts?.length || 0}

=== OUTPUT FORMAT (JSON) ===
{
  "titles": {
    "tiktok": "Catchy TikTok title in Thai (max 100 chars)",
    "facebook": "Engaging Facebook title in Thai (max 150 chars)",
    "instagram": "Instagram caption in Thai (max 100 chars)",
    "youtube": "SEO-friendly YouTube title in Thai (max 100 chars)"
  },
  "tags": {
    "tiktok": ["5 relevant trending tags WITHOUT # symbol"],
    "facebook": ["3 engaging tags"],
    "instagram": ["30 relevant hashtags for maximum reach WITHOUT # symbol"],
    "youtube": ["10 SEO optimized tags"]
  }
}

IMPORTANT:
- ALL titles MUST be in Thai
- ALL tags must be relevant to "${episodeTopic}"
- Tags must NOT include the # symbol
- Output valid JSON only, no markdown`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a social media expert. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    let content = response.choices[0].message.content.trim();
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    return JSON.parse(content);
  } catch (err) {
    console.error('generateTitlesAndTags error:', err.message);
    // Fallback
    return {
      titles: {
        tiktok: episodeTopic || 'Video',
        facebook: episodeTopic || 'Video',
        instagram: episodeTopic || 'Video',
        youtube: episodeTopic || 'Video'
      },
      tags: {
        tiktok: ['video', 'viral', 'fyp', 'trending', 'content'],
        facebook: ['video', 'content', 'watch'],
        instagram: Array(30).fill('content'),
        youtube: Array(10).fill('video')
      }
    };
  }
}

// ============================================
// SHARED HELPER: Extract raw scenes from Mode data
// ============================================
function extractRawScenesFromMode(modeData) {
  const rawScenes = [];
  const characters = modeData.characters || [];
  const locations = modeData.locations || [];

  (modeData.blocks || []).forEach((block, blockIndex) => {
    // If block has evolution steps, extract each step as a scene
    if (block.evolution && block.evolution.length > 0) {
      block.evolution.forEach((step, stepIndex) => {
        const dialogues = (step.dialogues || []).map(d => {
          const char = characters.find(c => c.id === d.characterId);
          return {
            character: char?.name || 'Unknown',
            text: d.text || ''
          };
        });

        const location = locations.find(l => l.id === step.locationId);

        rawScenes.push({
          sceneNumber: rawScenes.length + 1,
          blockTitle: block.title || `Scene ${blockIndex + 1}`,
          visualPrompt: step.rawPrompt || block.title || '',
          rawPrompt: step.rawPrompt || '',
          sceneInstruction: step.sceneInstruction || '',
          audioAmbience: step.audioInstruction || '',
          audioInstruction: step.audioInstruction || '',
          cameraAngle: step.cameraAngle || 'wide',
          timeOfDay: step.timeOfDay || 'day',
          locationName: location?.name || '',
          dialogues: dialogues
        });
      });
    } else {
      // Block without evolution - use block title as scene
      rawScenes.push({
        sceneNumber: rawScenes.length + 1,
        blockTitle: block.title || `Scene ${blockIndex + 1}`,
        visualPrompt: block.title || '',
        rawPrompt: '',
        audioAmbience: '',
        cameraAngle: 'wide',
        timeOfDay: 'day',
        dialogues: []
      });
    }
  });

  return rawScenes;
}

// ============================================
// SHARED HELPER: Get Next Episode from Queue
// Supports: sequential (order asc) or random selection
// ============================================
async function getNextEpisode(projectRef, selectionMode = 'sequential') {
  const episodesRef = projectRef.collection('episodes');
  
  // Query only pending episodes
  let query = episodesRef.where('status', '==', 'pending');

  if (selectionMode === 'random') {
    // Random: fetch all pending then pick one randomly
    const snapshot = await query.get();
    if (snapshot.empty) return null;

    const randomIndex = Math.floor(Math.random() * snapshot.size);
    const doc = snapshot.docs[randomIndex];
    return { id: doc.id, ref: doc.ref, ...doc.data() };
  } else {
    // Sequential: order by 'order' field ascending, get first
    query = query.orderBy('order', 'asc').limit(1);
    const snapshot = await query.get();
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ref: doc.ref, ...doc.data() };
  }
}

// ============================================
// SHARED HELPER: Get Remaining Episode Count
// ============================================
async function getRemainingEpisodeCount(projectRef) {
  const snapshot = await projectRef.collection('episodes')
    .where('status', '==', 'pending')
    .get();
  return snapshot.size;
}

exports.consultantChat = functions.https.onCall(async (data, context) => {
  try {
    const openai = getOpenAI();
    const { message, history, currentModeData, aiMode = 'architect', expanderList = [] } = data;

    // System prompt for Architect Mode (สร้างโครงเรื่อง)
    const architectSystemPrompt = `You are "AI Mode Architect" - ผู้ช่วยออกแบบโครงสร้าง Mode 🎬

[🎯 CORE MISSION]
ช่วย User ออกแบบ "โครงสร้างฉาก" สำหรับวิดีโอ
- Mode = Template ที่มีชื่อฉากหลายๆ ฉาก
- Expander จะขยาย Prompt ให้ภายหลัง (ไม่ต้องเขียน Prompt ละเอียด)
- ใช้ [TOPIC] เป็น Placeholder สำหรับหัวข้อจาก Content Queue

[📋 RESPONSE FORMAT - JSON เท่านั้น]
{
  "reply": "ข้อความตอบกลับ",
  "options": ["ตัวเลือก1", "ตัวเลือก2"] หรือ null,
  "suggestedFix": null หรือ { Mode Object },
  "inputFields": null
}

[💬 CONVERSATION FLOW]
ต้องคุยกับ User ให้ได้ข้อมูลครบก่อนสร้าง Mode:

1. **ถามประเภทวิดีโอ** (ถ้ายังไม่รู้)
   - ให้เลือก 1 ใน 9 Categories:
   - options: ["🎬 Cinematic / Movie", "📖 Short Film / Story", "📦 Product Showcase / Commercial", "🏠 Real Estate / Architecture", "📹 Vlog / Lifestyle", "⏱️ Time-lapse / Hyper-lapse", "📺 Documentary / News", "📚 How-to / Tutorial", "🎵 Relaxation / Lo-fi / ASMR"]

2. **ถามจำนวนฉากที่ต้องการ** (ถ้ายังไม่รู้)
   - ให้ User พิมพ์จำนวนเอง (ไม่จำกัด, แนะนำ 3-10 ฉาก)
   - ถามว่า "ต้องการกี่ฉากครับ? (แนะนำ 3-10 ฉาก แต่ใส่มากกว่านี้ได้)"

3. **ถามโทนหรือบรรยากาศ** (ถ้ายังไม่รู้)
   - ตัวอย่าง options: ["🔥 ดราม่า", "😊 สนุกสนาน", "😢 ซึ้ง", "😱 ระทึก"]

4. **ถาม System Instruction (The Brain)** (ถ้ายังไม่รู้)
   - ถามว่า "อยากให้ AI มีบทบาทอย่างไรครับ? เช่น 'คุณเป็นผู้กำกับหนังที่เน้นดราม่า'"
   - หรือแนะนำให้ตามประเภทวิดีโอ

5. **เมื่อได้ข้อมูลครบ → เสนอสร้าง Mode**
   - สรุปสิ่งที่จะสร้าง
   - ให้ options: ["✅ สร้างเลย!", "🔄 ปรับแก้ก่อน"]

[🎬 WHEN USER CONFIRMS OR CLICKS "สร้าง Mode"]
ระบบจะส่ง message พิเศษ: "[[GENERATE_MODE]]" หรือ User บอก "สร้างเลย"

เมื่อได้รับ → สร้าง Mode ทันที:

[📝 MODE STRUCTURE - ใหม่! (ไม่ต้องมี rawPrompt)]
{
  "name": "ชื่อ Mode",
  "description": "คำอธิบายสั้นๆ",
  "category": "Cinematic / Movie",
  "systemInstruction": "คำอธิบายบทบาทของ AI สำหรับ Mode นี้ เช่น 'คุณเป็นผู้กำกับหนังที่เชี่ยวชาญด้านดราม่า...'",
  "blocks": [
    {
      "id": 1,
      "title": "[TOPIC] - ฉาก 1: เปิดเรื่อง",
      "sequencePercentage": 20,
      "evolution": [{ "id": 101, "stepPercentage": 100 }]
    },
    {
      "id": 2,
      "title": "[TOPIC] - ฉาก 2: แนะนำปัญหา",
      "sequencePercentage": 25,
      "evolution": [{ "id": 102, "stepPercentage": 100 }]
    },
    ...
  ]
}

[🎭 CATEGORY DIALOGUE RULES - IMPORTANT!]
Category ที่เลือกจะกำหนดรูปแบบบทสนทนาในแต่ละฉาก:

- **Cinematic / Movie**: 2-5 บทสนทนาตาม Emotional Arc (ดราม่า, สนทนา)
- **Short Film / Story**: 2-4 บทสนทนาต่อฉาก (เล่าเรื่อง)
- **Product Showcase / Commercial**: 0-1 บทสนทนา (แค่ Tagline)
- **Real Estate / Architecture**: 0 บทสนทนา (ภาพอย่างเดียว)
- **Vlog / Lifestyle**: 2-4 บทสนทนา (พูดกับกล้อง)
- **Time-lapse / Hyper-lapse**: 0 บทสนทนา (เพลง+Ambient)
- **Documentary / News**: 1-3 บทสนทนา (Voiceover, สัมภาษณ์)
- **How-to / Tutorial**: 3-5 บทสนทนา (อธิบายทีละขั้นตอน)
- **Relaxation / Lo-fi / ASMR**: 0 บทสนทนา (เสียงบรรยากาศ)

⚠️ ต้องเลือก Category ที่ตรงเพื่อให้ AI Expander สร้างบทสนทนาได้ถูกต้อง!

[🎭 SCENE TITLE EXAMPLES]
ใช้ [TOPIC] + ชื่อฉากที่มีความหมาย:
- "[TOPIC] - เปิดเรื่อง: พบกับตัวละครหลัก"
- "[TOPIC] - ปัญหา: เผชิญอุปสรรค"
- "[TOPIC] - จุดพลิก: ค้นพบความจริง"
- "[TOPIC] - ไคลแมกซ์: การเผชิญหน้าครั้งสุดท้าย"
- "[TOPIC] - บทสรุป: จบเรื่อง"

[🎭 STORY STRUCTURE GUIDE]
- Act 1 (15-20%): Hook - ดึงดูดคนดู (INTRODUCTION - minimal dialogue)
- Act 2 (25-30%): Setup - แนะนำปัญหา (RISING - building dialogue)
- Act 3 (35-40%): Rising Action - เข้มข้นขึ้น (CLIMAX - peak dialogue)
- Act 4 (15-20%): Climax - จุดพีค (RESOLUTION - closing dialogue)

[⚡ IMPORTANT]
- ตอบกลับเสมอ ห้ามเงียบ
- ถามทีละคำถาม ไม่ถามหลายอย่างพร้อมกัน
- ใช้ options เพื่อให้ User เลือกง่าย
- Category ต้องตรงกับ 1 ใน 9 รายการข้างบน
- สร้าง Mode เมื่อได้ข้อมูลครบ + User ยืนยัน`;

    // Build Expander list for AI to show
    const expanderListText = expanderList && expanderList.length > 0
      ? expanderList.map((exp, i) => `${i + 1}. "${exp.name}" - ${exp.blocks?.length || 0} กล่อง`).join('\n')
      : 'ไม่มี Expander ในระบบ';

    // System prompt for Instruction Mode (สร้างคำสั่งฉาก)
    const instructionSystemPrompt = `You are "AI Scene Writer" - ผู้ช่วยเขียนคำสั่งฉากระดับมืออาชีพ 🎬

[🎯 CORE MISSION]
ช่วย User เขียน **โครงสร้างฉาก (Scene Structure)** ที่กระชับ
- ⚠️ สร้างเฉพาะ **โครงสร้าง** เท่านั้น ไม่ใช่บทพูดเต็ม
- ⚠️ ห้ามเขียนบทพูดตรงๆ → ใช้ [DIALOGUE: หัวข้อ] แทน
- ⚠️ ต้องเข้าใจ Expander อย่างละเอียดก่อนสร้างโครงสร้าง

[📋 RESPONSE FORMAT - JSON เท่านั้น]
{
  "reply": "ข้อความตอบกลับ",
  "options": ["ตัวเลือก1", "ตัวเลือก2"] หรือ null,
  "sceneInstructions": [
    { "blockIndex": 0, "instruction": "โครงสร้างฉาก 1" }
  ] หรือ null,
  "selectedExpander": "ชื่อ Expander ที่เลือก" หรือ null
}

[📦 EXPANDER LIST ที่มีในระบบ]
${expanderListText}

[💬 CONVERSATION FLOW - IMPORTANT!]

**STEP 1: แสดง Expander ที่มีให้ User เลือก**
เมื่อเริ่มต้น ต้องแสดงรายชื่อ Expander ทั้งหมดที่มี:

"สวัสดีครับ! ผมคือ AI Scene Writer 🎬

ก่อนสร้างโครงสร้างฉาก ผมต้องเข้าใจ Expander ที่คุณจะใช้ก่อนนะครับ

📦 **Expander ที่มีในระบบ:**
${expanderListText}

กรุณาเลือก Expander ที่ต้องการใช้ครับ"

options: ให้แสดงชื่อ Expander แต่ละตัวเป็น option + "❌ ไม่ใช้ Expander"

**STEP 2: เมื่อ User เลือก Expander → แสดงรายละเอียดของ Expander นั้น**
⚠️ สำคัญมาก! ต้องดูข้อมูล Expander จริงๆ จาก expanderList

เมื่อ User เลือก Expander แล้ว ต้อง:
1. ค้นหา Expander จาก expanderList
2. แสดงกล่องทั้งหมดใน Expander นั้น
3. สรุปว่าแต่ละกล่องทำอะไร
4. ขออนุญาตสร้างโครงสร้างฉาก

ตัวอย่างการตอบ:
"ผมเข้าใจแล้วครับ! คุณเลือก Expander **'ดราม่าอีสาน'** 

📋 **กล่องใน Expander นี้:**
1. **กล่อง 'ภาษาอีสาน'**: กำหนดให้ใช้ภาษาอีสานในบทสนทนา
2. **กล่อง 'สไตล์ดราม่า'**: เน้นอารมณ์ดราม่า ซึ้ง
3. **กล่อง 'กล้อง Cinematic'**: ใช้มุมกล้องแบบหนัง

📊 **สรุป:**
- ภาษา: อีสาน
- สไตล์: ดราม่า ซึ้ง
- จำนวนบทสนทนา: 3-5 ต่อฉาก

ผมพร้อมสร้างโครงสร้างฉากแล้วครับ ต้องการสร้างสำหรับฉากไหนครับ?"

options: ["🎬 ทุกฉาก", "ฉาก 1", "ฉาก 2", ...]

**STEP 3: สร้างโครงสร้างฉาก**
เมื่อได้รับอนุญาต → สร้างโครงสร้างฉากโดยใช้ความเข้าใจจาก Expander

[🎬 SCENE STRUCTURE FORMAT - โครงสร้างเท่านั้น!]

✅ ถูกต้อง (โครงสร้าง):
"Wide shot เปิดฉาก, กล้อง pan ช้า แสดงบรรยากาศ, Medium shot ตัวละครหลัก [DIALOGUE: แนะนำตัว], Close-up ใบหน้า แสดงอารมณ์ [DIALOGUE: ตอบโต้], transition fade"

❌ ผิด (มีบทพูดเต็ม):
"Wide shot เปิดฉาก กล้อง pan ช้า [DIALOGUE: มาส - 'พร้อมหรือยัว?'] Medium shot ออยลี่ [DIALOGUE: ออยลี่ - 'จ้นพร้อมแล้วเด้อ!']"

[🔴 DIALOGUE PLACEHOLDER RULES]
- ใช้ [DIALOGUE: หัวข้อ] เท่านั้น
- ตัวอย่าง: [DIALOGUE: แนะนำตัว], [DIALOGUE: ถามคำถาม], [DIALOGUE: ตอบรับ]
- ❌ ห้าม: [DIALOGUE: มาส - 'พร้อมหรือยัว?']
- AI Expander จะสร้างบทพูดจริงตาม Expander rules + Episode Topic

[📊 DIALOGUE AMOUNT BY EXPANDER]
ปรับจำนวน [DIALOGUE: ...] ตาม Expander:
- Expander บอก "พูดมาก/สนทนาเยอะ" → 3-5 dialogue placeholders ต่อฉาก
- Expander บอก "พูดน้อย/minimal" → 1-2 dialogue placeholders ต่อฉาก
- Expander บอก "ไม่มีบทพูด" → 0 dialogue placeholders
- ไม่มี Expander → ใช้ Category rules

[🎭 CATEGORY RULES (ใช้เมื่อไม่มี Expander)]
- Cinematic / Movie: 2-5 dialogues per scene
- Short Film / Story: 2-4 dialogues per scene
- Product Showcase: 0-1 dialogues
- Real Estate: 0 dialogues
- Vlog / Lifestyle: 2-4 dialogues
- Time-lapse: 0 dialogues
- Documentary: 1-3 dialogues
- Tutorial: 3-5 dialogues
- Relaxation / ASMR: 0 dialogues

[⚡ IMPORTANT]
- 🔴 แสดง Expander ที่มีให้ User เลือกก่อนเสมอ!
- 🔴 เมื่อ User เลือก Expander → ต้องแสดงรายละเอียดกล่องทั้งหมด
- 🔴 สรุปความเข้าใจ Expander ก่อนขออนุญาตสร้าง
- 🔴 สร้างเฉพาะโครงสร้าง ไม่ใช่บทพูดเต็ม
- 🔴 ใช้ [DIALOGUE: หัวข้อ] ไม่ใช่ [DIALOGUE: ชื่อ - 'บทพูด']
- โครงสร้างต้องกระชับ (30-50 คำต่อฉาก)
- sceneInstructions ต้องมี blockIndex ที่ตรงกับ index ของ blocks array`;

    // Select system prompt based on aiMode
    const systemPrompt = aiMode === 'instruction' ? instructionSystemPrompt : architectSystemPrompt;

    const fullHistory = [
      { role: 'system', content: systemPrompt },
      ...history,
      {
        role: 'user',
        content: `Current Mode Data: ${JSON.stringify(currentModeData)} \n\nUser Request: ${message}`
      }
    ];

    // Add explicit JSON instruction to satisfy OpenAI API requirement
    const messagesWithJsonHint = [
      ...fullHistory,
      { role: 'system', content: 'IMPORTANT: Always respond with valid JSON format only. No other text.' }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messagesWithJsonHint,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    return JSON.parse(completion.choices[0].message.content);

  } catch (error) {
    console.error('Error in consultantChat:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// --- 4. Generate User Key (For Extension Access) ---
// ADMIN EMAIL - can be moved to Firestore config later
const ADMIN_EMAILS = ['fxfarm.dashboard@gmail.com'];

exports.generateUserKey = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }

  const userId = context.auth.uid;
  const userEmail = context.auth.token.email || '';

  try {
    const db = admin.firestore();

    // Check if user is admin
    const isAdmin = ADMIN_EMAILS.includes(userEmail.toLowerCase());

    // Generate unique key: base64(userId:isAdmin:timestamp:random)
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const adminFlag = isAdmin ? 'ADMIN' : 'USER';
    const rawKey = `${userId}:${adminFlag}:${timestamp}:${random}`;
    const encodedKey = Buffer.from(rawKey).toString('base64');

    // Store key in user document
    await db.collection('users').doc(userId).set({
      extensionKey: {
        keyHash: Buffer.from(encodedKey).toString('base64'),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isAdmin: isAdmin,
        active: true
      }
    }, { merge: true });

    console.log(`🔑 User Key generated for ${userEmail} (Admin: ${isAdmin})`);

    return {
      success: true,
      key: encodedKey,
      isAdmin: isAdmin,
      message: isAdmin
        ? 'Admin Key generated! You have full access to recording features.'
        : 'User Key generated! You can monitor and execute scheduled jobs.'
    };

  } catch (error) {
    console.error('Error generating key:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// --- 4.5 AI Prompt Compiler (Translate TH→EN + Compile Scenes) ---
exports.compilePrompts = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { modeData, variableValues } = data;

    if (!modeData || !modeData.blocks) {
      throw new functions.https.HttpsError('invalid-argument', 'Mode data with blocks is required');
    }

    try {
      const openai = getOpenAI();

      // 1. Build COMPLETE context from Mode
      const systemInstruction = modeData.systemInstruction || '';
      const category = modeData.category || 'Cinematic';
      const description = modeData.description || '';
      const characters = modeData.characters || [];
      const locations = modeData.locations || [];
      const storyOverview = modeData.storyOverview || {};

      // 2. Extract all scenes with COMPLETE data
      const rawScenes = [];
      (modeData.blocks || []).forEach((block, blockIndex) => {
        (block.evolution || []).forEach((step, stepIndex) => {
          // Get dialogues with character info
          const dialogues = (step.dialogues || []).map(d => {
            const char = characters.find(c => c.id === d.characterId);
            return {
              character: char?.name || 'Unknown',
              voiceStyle: char?.voiceStyle || 'neutral',
              visualDescription: char?.visualDescription || '',
              text: d.text || '',
              timing: d.timing || 'start'
            };
          });

          // Get location info
          const location = locations.find(l => l.id === step.locationId);

          rawScenes.push({
            sceneNumber: rawScenes.length + 1,
            blockTitle: block.title || `Scene ${blockIndex + 1}`,
            visualPrompt: step.rawPrompt || '',
            audioAmbience: step.audioInstruction || '',
            cameraAngle: step.cameraAngle || 'wide',
            locationName: location?.name || '',
            locationVisual: location?.visualDescription || '',
            timeOfDay: step.timeOfDay || 'day',
            bgmMood: step.bgmMood || 'epic',
            backgroundVoices: step.backgroundVoices || '',
            dialogues: dialogues
          });
        });
      });

      // 3. Build DETAILED prompt for AI
      const characterDescriptions = characters.map(c =>
        `- ${c.name} (${c.role || 'main'}): ${c.description || 'No role'}\n  Appearance: ${c.visualDescription || 'Not specified'}\n  Voice: ${c.voiceStyle || 'neutral'}`
      ).join('\n') || 'None';

      const locationDescriptions = locations.map(l =>
        `- ${l.name}: ${l.visualDescription || 'No description'}`
      ).join('\n') || 'None';

      const sceneDescriptions = rawScenes.map((s, i) => {
        let sceneText = `\nScene ${i + 1} (${s.blockTitle}):\n`;
        sceneText += `  Location: ${s.locationName || 'Not specified'} - ${s.locationVisual}\n`;
        sceneText += `  Time: ${s.timeOfDay}\n`;
        sceneText += `  Visual: ${s.visualPrompt}\n`;
        sceneText += `  Audio Ambience: ${s.audioAmbience}\n`;
        sceneText += `  BGM Mood: ${s.bgmMood}\n`;
        sceneText += `  Camera: ${s.cameraAngle}\n`;
        if (s.backgroundVoices) {
          sceneText += `  Background Voices: ${s.backgroundVoices}\n`;
        }
        if (s.dialogues.length > 0) {
          sceneText += `  Dialogues:\n`;
          s.dialogues.forEach(d => {
            sceneText += `    - ${d.character} (${d.timing}): "${d.text}"\n`;
          });
        }
        return sceneText;
      }).join('\n');

      const aiPrompt = `You are a professional cinematic video prompt engineer. Your task is to:
1. Read the following Thai video mode description COMPLETELY
2. Create cohesive, connected scenes that tell a COMPLETE story
3. Translate everything to English for AI video generation
4. Each scene is 8 seconds long - make prompts appropriate for this duration
5. Ensure VISUAL CONTINUITY - characters must look the same in every scene
6. Include character appearance details in EVERY scene prompt

=== STORY OVERVIEW ===
Synopsis: ${storyOverview.synopsis || 'Not provided'}
Theme: ${storyOverview.theme || 'Not provided'}
Tone: ${storyOverview.tone || 'epic'}
Target Duration: ${storyOverview.totalDuration || '3-5 min'}

=== MODE CONTEXT ===
Category: ${category}
Description: ${description}
System Instruction: ${systemInstruction}

=== CHARACTERS (IMPORTANT - Include appearance in every scene) ===
${characterDescriptions}

=== LOCATIONS ===
${locationDescriptions}

=== RAW SCENES (in Thai) ===
${sceneDescriptions}

=== OUTPUT FORMAT (JSON array) ===
[
  {
    "sceneNumber": 1,
    "englishPrompt": "DETAILED English prompt including character appearances, location details, lighting based on time of day, 8 seconds...",
    "audioDescription": "Sound effects, ambient sounds, and music mood in English...",
    "cameraMovement": "Specific camera angle and movement in English...",
    "dialogueScript": "Character dialogue in English with timing markers...",
    "backgroundVoices": "Background/ambient character voices if any..."
  }
]

=== CRITICAL RULES ===
- ALWAYS include character visual descriptions (clothing, appearance) in englishPrompt
- Match lighting to timeOfDay (dawn=golden, day=bright, sunset=warm orange, night=dark blue)
- Keep BGM mood consistent with bgmMood field
- Make scenes flow naturally - this is a cohesive story
- Each prompt must be self-contained with all visual details for AI video generation
- Translate Thai to natural, cinematic English`;

      // 4. Call OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a video prompt engineer. Output valid JSON only.' },
          { role: 'user', content: aiPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
      });

      const responseText = completion.choices[0]?.message?.content || '[]';

      // 5. Parse JSON response
      let compiledScenes;
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        compiledScenes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch (parseErr) {
        console.error('Failed to parse AI response:', parseErr);
        compiledScenes = rawScenes.map((s, i) => ({
          sceneNumber: i + 1,
          englishPrompt: s.visualPrompt,
          audioDescription: s.audioAmbience,
          cameraMovement: s.cameraAngle,
          dialogueScript: s.dialogues.map(d => `${d.character}: ${d.text}`).join('; ')
        }));
      }

      console.log(`✅ Compiled ${compiledScenes.length} scenes`);

      return {
        success: true,
        compiledScenes: compiledScenes,
        rawSceneCount: rawScenes.length
      };

    } catch (error) {
      console.error('Prompt compilation error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// --- 5. Central Scheduler (The Station Master) ---
exports.scheduleJobs = functions.pubsub.schedule('every 1 minutes')
  .timeZone('UTC') // Run in UTC to handle all offsets manually
  // Force Deploy Change: v3.1 (Debug)
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    console.log(`🚂 SUPER-SCHEDULER v3.0 START: ${now.toISOString()}`);

    try {
      // 1. Get ALL Running Projects
      // NOTE: This Collection Group query requires a Composite Index on 'projects' -> 'status'.
      const runningProjectsSnap = await db.collectionGroup('projects')
        .where('status', '==', 'running')
        .get();

      if (runningProjectsSnap.empty) {
        console.log('💤 No running projects found (empty snapshot). Scheduler sleeping.');
        return;
      }

      console.log(`Found ${runningProjectsSnap.size} running projects.`);

      // 2. Group Projects by User (Optimization to fetch User Profile once)
      const projectsByUser = {};
      runningProjectsSnap.docs.forEach(doc => {
        const p = doc.data();
        const userId = doc.ref.parent.parent.id;
        if (!projectsByUser[userId]) projectsByUser[userId] = [];
        projectsByUser[userId].push({ id: doc.id, ref: doc.ref, data: p });
      });

      // 3. Process each User
      for (const userId of Object.keys(projectsByUser)) {
        try {
          // A. Fetch User Timezone
          const userDoc = await db.collection('users').doc(userId).get();
          const userTz = (userDoc.exists && userDoc.data().timezone) ? userDoc.data().timezone : 'Asia/Bangkok';

          // B. Calculate User's Local Time (Robust Method using Intl.DateTimeFormat)
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTz,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
            weekday: 'short'
          });

          const parts = formatter.formatToParts(now);
          const getPart = (type) => parts.find(p => p.type === type).value;

          const currentHour = getPart('hour').padStart(2, '0').replace('24', '00'); // Safety for 24-hour glitches
          const currentMinute = getPart('minute').padStart(2, '0');
          const currentTimeStr = `${currentHour}:${currentMinute}`;

          // Weekday comes from formatter as 'Sun', 'Mon' etc. - We need lowercase 'sun', 'mon'
          const currentDay = getPart('weekday').toLowerCase();

          // Double check if '24' issue pushed day forward incorrectly? 
          // Actually Intl.DateTimeFormat handles day rollover correctly, so the 'weekday' part should be correct for the user's localized time.

          if (!currentDay) {
            console.error(`❌ Error calculating day for User ${userId}. TZ: ${userTz}, RawParts: ${JSON.stringify(parts)}`);
            continue;
          }

          console.log(`👤 User: ${userId} | TZ: ${userTz} | Local: ${currentDay.toUpperCase()} ${currentTimeStr}`);

          // C. Check Projects for this User
          // Helper to normalize time string for comparison (e.g. 09:05 -> 09:05, 9:5 -> 09:05)
          const normalizeTime = (t) => {
            if (!t) return "";
            const parts = String(t).trim().split(':');
            if (parts.length !== 2) return String(t).trim();
            return `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}`;
          };

          for (const project of projectsByUser[userId]) {
            // Check Slots (Only for current day)
            // Firestore query inside loop is okay if scale is low, but better to structure slots differently later or read all slots.
            // For now, let's query slots for the current day.
            const slotsRef = project.ref.collection('slots').where('day', '==', currentDay);
            const slotsSnap = await slotsRef.get();

            if (slotsSnap.empty) {
              // console.log(`   [${project.data.name}] No slots found for ${currentDay}`);
              continue;
            }

            console.log(`   📂 [${project.data.name}] found ${slotsSnap.size} slots for ${currentDay}. Checking matches...`);

            for (const slotDoc of slotsSnap.docs) {
              const slot = slotDoc.data();
              const slotStartNormalized = normalizeTime(slot.start);

              // --- DEBUG: LOG EVERYTHING ---
              console.log(`      🔍 Checking Slot: '${slot.start}' | Normalized: '${slotStartNormalized}' | Current: '${currentTimeStr}'`);

              // EXACT MATCH CHECK (Normalized)
              if (slotStartNormalized === currentTimeStr) {
                console.log(`      ✅ MATCH FOUND! Project: ${project.data.name} @ ${slot.start}`);

                // D. IDEMPOTENCY & JOB CREATION
                const jobId = `job_${project.id}_${currentDay}_${slotStartNormalized.replace(':', '')}_${new Date().toISOString().split('T')[0]}`;
                const jobRef = db.collection('agent_jobs').doc(jobId);
                const jobExists = await jobRef.get();

                if (!jobExists.exists) {
                  // Extract scene data from Mode (prefer compiledScenes if available)
                  const variableValues = project.data.variableValues || {};
                  let prompts = []; // Final prompts to use (English)
                  let scenes = []; // Complete scene objects
                  let modeMetadata = {};
                  let episodeData = null; // Episode from Content Queue

                  // === CONTENT QUEUE INTEGRATION using SHARED HELPER ===
                  // Get episode selection mode from project settings (default: sequential)
                  const episodeSelectionMode = project.data.episodeSelection || 'sequential';
                  console.log(`      🎯 Episode selection mode: ${episodeSelectionMode}`);

                  // Use SHARED getNextEpisode helper
                  const episodeResult = await getNextEpisode(project.ref, episodeSelectionMode);

                  if (episodeResult) {
                    episodeData = episodeResult;
                    console.log(`      📺 Episode from Queue: "${episodeData.title}" (mode: ${episodeSelectionMode})`);

                    // Mark episode as processing
                    await episodeResult.ref.update({
                      status: 'processing',
                      processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                  } else {
                    console.log(`      ⚠️ No pending episodes in queue, using Mode defaults`);
                  }

                  const modeId = project.data.executionModeId;
                  if (modeId) {
                    try {
                      const modeDoc = await db.collection('users').doc(userId).collection('modes').doc(modeId).get();
                      if (modeDoc.exists) {
                        const modeData = modeDoc.data();
                        console.log(`      📋 Mode loaded: ${modeData.name}`);

                        // Store Mode-level metadata
                        modeMetadata = {
                          modeName: modeData.name || '',
                          category: modeData.category || '',
                          description: modeData.description || '',
                          systemInstruction: modeData.systemInstruction || '',
                          characters: modeData.characters || []
                        };

                        // PRIORITY 1: Use pre-compiled English scenes (from AI)
                        if (modeData.compiledScenes && modeData.compiledScenes.length > 0) {
                          console.log(`      🤖 Using ${modeData.compiledScenes.length} AI-compiled scenes`);
                          scenes = modeData.compiledScenes;
                          prompts = scenes.map(s => s.englishPrompt);
                        }
                        // PRIORITY 2: Fallback to block titles (rawPrompt removed - Expander handles expansion)
                        else if (modeData.blocks && Array.isArray(modeData.blocks)) {
                          console.log(`      ⚠️ No compiled scenes, using block titles`);
                          modeData.blocks.forEach((block, blockIdx) => {
                            // Use block title as scene prompt (Expander will expand it later)
                            const sceneTitle = block.title || `Scene ${blockIdx + 1}`;
                            prompts.push(sceneTitle);

                            scenes.push({
                              sceneNumber: scenes.length + 1,
                              englishPrompt: sceneTitle,
                              audioDescription: '',
                              cameraMovement: 'wide',
                              dialogueScript: ''
                            });
                          });
                        }
                        console.log(`      🎬 Total ${prompts.length} prompts ready for execution`);
                      }
                    } catch (modeErr) {
                      console.error(`      ❌ Error loading Mode: ${modeErr.message}`);
                    }
                  }

                  // FALLBACK: Legacy prompts support (if no prompts from Mode)
                  if (prompts.length === 0) {
                    if (variableValues.prompts && Array.isArray(variableValues.prompts)) {
                      prompts = variableValues.prompts;
                    } else if (variableValues.prompt) {
                      prompts = [variableValues.prompt];
                    }
                  }

                  // === EXPANDER INTEGRATION using SHARED LOGIC ===
                  // Check if project has an Expander selected
                  const expanderId = project.data.expanderId;
                  let expanderBlocks = [];
                  let expandedPromptsResult = [];
                  let titlesAndTags = null;

                  if (expanderId) {
                    console.log(`      ⚡ Expander detected: ${expanderId}`);
                    try {
                      // Fetch Expander blocks
                      const expanderDoc = await project.ref.parent.parent.collection('expanders').doc(expanderId).get();
                      if (expanderDoc.exists) {
                        const expanderData = expanderDoc.data();
                        expanderBlocks = expanderData.blocks || [];
                      }
                    } catch (expandErr) {
                      console.error(`      ⚠️ Error loading Expander:`, expandErr.message);
                    }
                  }

                  // Use SHARED LOGIC for expansion (same as testPromptPipeline)
                  if (scenes.length > 0 || prompts.length > 0) {
                    try {
                      // Build raw scenes from existing data
                      const rawScenes = scenes.length > 0
                        ? scenes.map((s, i) => ({
                            sceneNumber: i + 1,
                            blockTitle: s.blockTitle || `Scene ${i + 1}`,
                            visualPrompt: s.englishPrompt || prompts[i] || '',
                            rawPrompt: s.englishPrompt || prompts[i] || '',
                            audioAmbience: s.audioDescription || '',
                            cameraAngle: s.cameraMovement || 'wide'
                          }))
                        : prompts.map((p, i) => ({
                            sceneNumber: i + 1,
                            blockTitle: `Scene ${i + 1}`,
                            visualPrompt: p,
                            rawPrompt: p,
                            audioAmbience: '',
                            cameraAngle: 'wide'
                          }));

                      console.log(`      🔧 Using SHARED expandScenesWithTopic() for ${rawScenes.length} scenes...`);

                      // Use SHARED HELPER for per-scene expansion
                      expandedPromptsResult = await expandScenesWithTopic({
                        rawScenes,
                        expanderBlocks,
                        episodeTopic: episodeData?.title || modeMetadata.modeName || 'Video',
                        episodeDesc: episodeData?.description || modeMetadata.description || '',
                        characters: modeMetadata.characters || [],
                        sceneDuration: 8,
                        modeCategory: modeMetadata.category || 'Cinematic',
                        systemInstruction: modeMetadata.systemInstruction || ''
                      });

                      // Update prompts array with expanded versions
                      prompts = expandedPromptsResult.map(p => p.englishPrompt);
                      scenes = expandedPromptsResult;

                      console.log(`      ✅ Expanded ${prompts.length} prompts using SHARED LOGIC`);

                      // Generate Titles and Tags using SHARED HELPER
                      titlesAndTags = await generateTitlesAndTags({
                        episodeTopic: episodeData?.title || modeMetadata.modeName || 'Video',
                        episodeDesc: episodeData?.description || '',
                        modeCategory: modeMetadata.category || 'Entertainment',
                        expandedPrompts: expandedPromptsResult
                      });

                    } catch (expandErr) {
                      console.error(`      ⚠️ Expansion error (using original prompts):`, expandErr.message);
                    }
                  }

                  // === SAVE TO readyPrompts/ COLLECTION ===
                  const readyPromptData = {
                    prompts: expandedPromptsResult.length > 0 ? expandedPromptsResult : scenes,
                    titles: titlesAndTags?.titles || null,
                    tags: titlesAndTags?.tags || null,
                    episodeId: episodeData?.id || null,
                    episodeTitle: episodeData?.title || null,
                    modeId: modeId || null,
                    modeName: modeMetadata.modeName || null,
                    expanderId: expanderId || null,
                    status: 'ready',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                  };

                  const readyPromptRef = await project.ref.collection('readyPrompts').add(readyPromptData);
                  console.log(`      📦 Ready prompt saved: ${readyPromptRef.id}`);

                  // === BUILD BLOCK SEQUENCE ===
                  const PLATFORM_TO_UPLOAD_BLOCK = {
                    'facebook': 'UPLOAD_FACEBOOK',
                    'youtube': 'UPLOAD_YOUTUBE',
                    'tiktok': 'UPLOAD_TIKTOK',
                    'instagram': 'UPLOAD_INSTAGRAM'
                  };

                  // สร้าง Block Sequence: ADD_SCENE → EXPORT → DOWNLOAD → UPLOAD(s)
                  const blockSequence = [
                    'ADD_SCENE_TEXT',   // 🔁 LOOP: ทำซ้ำตาม prompts.length
                    'EXPORT_VIDEO',     // ⏺ ONCE: Export วิดีโอ
                    'DOWNLOAD_FILE'     // ⏺ ONCE: Download ไฟล์
                  ];

                  // เพิ่ม Upload Block ตามที่ User เลือกไว้ใน Posting Schedule
                  const slotPlatforms = slot.platforms || [];
                  if (slotPlatforms.length > 0) {
                    slotPlatforms.forEach(p => {
                      const uploadBlock = PLATFORM_TO_UPLOAD_BLOCK[p.platformId];
                      if (uploadBlock) {
                        blockSequence.push(uploadBlock);
                      }
                    });
                  }

                  console.log(`      🧱 Block Sequence: ${blockSequence.join(' → ')}`);

                  // Create Job with Block Sequence
                  await jobRef.set({
                    projectId: project.id,
                    userId: userId,
                    blockSequence: blockSequence,
                    currentBlockIndex: 0,
                    platforms: slotPlatforms,
                    type: 'SCHEDULED',
                    status: 'PENDING',
                    variables: variableValues,
                    modeMetadata: modeMetadata,
                    scenes: scenes,
                    prompts: prompts,
                    titles: titlesAndTags?.titles || null,
                    tags: titlesAndTags?.tags || null,
                    episodeId: episodeData?.id || null,
                    episodeTitle: episodeData?.title || null,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    scheduledTime: slot.start
                  });

                  // --- ADDED: Write Log for UI Feedback ---
                  await project.ref.collection('logs').add({
                    message: `System: Scheduled Job created for ${slot.start} (${project.data.executionMode || 'Default'})`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    platform: 'SYSTEM',
                    type: 'info'
                  });

                  // === MOVE EPISODE TO HISTORY & MARK AS USED ===
                  if (episodeData && episodeData.id) {
                    try {
                      const episodeRef = project.ref.collection('episodes').doc(episodeData.id);
                      
                      // 1. Save to episodeHistory/ collection
                      await project.ref.collection('episodeHistory').add({
                        title: episodeData.title || 'Untitled',
                        description: episodeData.description || '',
                        originalOrder: episodeData.order || 0,
                        originalId: episodeData.id,
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        jobId: jobId,
                        readyPromptId: readyPromptRef.id,
                        generatedPrompts: expandedPromptsResult.length > 0 ? expandedPromptsResult : scenes,
                        titles: titlesAndTags?.titles || null,
                        tags: titlesAndTags?.tags || null,
                        wasSuccessful: true
                      });

                      // 2. Mark Episode as used (or delete - we keep it but mark status)
                      await episodeRef.update({
                        status: 'used',
                        usedAt: admin.firestore.FieldValue.serverTimestamp(),
                        jobId: jobId
                      });

                      console.log(`      📚 Episode "${episodeData.title}" moved to history`);

                      // === AUTO-REFILL CHECK ===
                      // Check if episodes are running low and auto-refill is enabled
                      const projectData = project.data;
                      if (projectData.autoRefillEnabled) {
                        const threshold = projectData.autoRefillThreshold || 5;
                        const refillCount = projectData.autoRefillCount || 10;
                        const refillPrompt = projectData.autoRefillPrompt || '';

                        const remainingCount = await getRemainingEpisodeCount(project.ref);
                        console.log(`      📊 Remaining episodes: ${remainingCount} (threshold: ${threshold})`);

                        if (remainingCount < threshold) {
                          console.log(`      ⚠️ Episodes running low! Triggering auto-refill...`);

                          // Get history for context
                          const historySnap = await project.ref.collection('episodeHistory')
                            .orderBy('usedAt', 'desc')
                            .limit(20)
                            .get();
                          
                          const historyContext = historySnap.docs.map(d => ({
                            title: d.data().title,
                            description: d.data().description
                          }));

                          // Trigger auto-generate (async, don't wait)
                          autoGenerateEpisodesInternal({
                            projectRef: project.ref,
                            userId: userId,
                            projectId: project.id,
                            count: refillCount,
                            prompt: refillPrompt,
                            historyContext
                          }).then(result => {
                            if (result.success) {
                              console.log(`      ✅ Auto-refill completed: ${result.count} episodes added`);
                            } else {
                              console.error(`      ❌ Auto-refill failed:`, result.error);
                            }
                          }).catch(err => {
                            console.error(`      ❌ Auto-refill error:`, err.message);
                          });
                        }
                      }
                    } catch (historyErr) {
                      console.error(`      ⚠️ Error moving episode to history:`, historyErr.message);
                    }
                  }

                  console.log(`      🚀 Job Created: ${jobId}`);
                } else {
                  console.log(`      ⚠️ Job already exists: ${jobId}`);
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error processing user ${userId}:`, err);
        }
      }
    } catch (globalErr) {
      console.error("🔥 CRITICAL SCHEDULER ERROR:", globalErr);
    }
  });

// ===== EXPANDER SYSTEM =====

// Function: Expand Prompt
exports.expandPrompt = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    const { simplePrompt, blocks } = data;

    if (!simplePrompt || !blocks || blocks.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing simplePrompt or blocks');
    }

    try {
      const openai = getOpenAI();

      // Build instruction from blocks
      const blockInstructions = blocks.map((b, i) => `${i + 1}. ${b.name}: ${b.instruction}`).join('\n');

      const systemPrompt = `You are a Premium Prompt Expander for AI video generation (Google Flow / Veo).

Your job is to expand a simple prompt into a detailed, cinematic prompt.

=== ACTIVE BLOCKS (User selected these rules) ===
${blockInstructions}

=== OUTPUT RULES ===
1. Write in English (required for Google Flow)
2. For Thai names, include original in parentheses: "Bas (บาส)"
3. Include: character descriptions, emotions, lighting, camera angles, ambient sounds
4. Be cinematic and detailed
5. Keep it under 500 words
6. Apply ALL the block instructions above

=== FORMAT ===
Return ONLY the expanded prompt, no explanations.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Expand this prompt: "${simplePrompt}"` }
        ],
        temperature: 0.8,
        max_tokens: 1000
      });

      const expandedPrompt = response.choices[0].message.content.trim();

      return { expandedPrompt };
    } catch (error) {
      console.error('Error expanding prompt:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Function: Generate Custom Block via AI Chat
exports.generateBlock = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    const { message } = data;

    if (!message) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing message');
    }

    try {
      const openai = getOpenAI();

      const systemPrompt = `You are a Block Generator for a Prompt Expander system.

User will describe what kind of "block" they want. A block is a rule/instruction that modifies how prompts are expanded.

=== YOUR JOB ===
1. Understand what the user wants
2. Generate a block with:
   - name: Short name with emoji (Thai, max 20 chars)
   - type: One of: language, style, lighting, audio, camera, emotion, custom
   - instruction: Clear instruction in English (this will be sent to AI)
   - color: Tailwind color class (bg-red-500, bg-blue-500, etc.)

=== OUTPUT FORMAT (JSON ONLY) ===
{
  "name": "🏛️ โบราณ",
  "type": "style",
  "instruction": "Use ancient/classical speech patterns. Characters speak formally with traditional expressions.",
  "color": "bg-amber-600"
}

=== EXAMPLES ===
User: "อยากได้กล่องที่ทำให้ตัวละครพูดแบบโบราณ"
Output: {"name": "🏛️ โบราณ", "type": "style", "instruction": "Characters speak in ancient/classical Thai style with formal expressions and traditional vocabulary.", "color": "bg-amber-600"}

User: "กล่องฝนตก"
Output: {"name": "🌧️ ฝนตก", "type": "lighting", "instruction": "Scene takes place during rain. Include rain sounds, wet surfaces, reflections, and characters getting wet.", "color": "bg-slate-600"}

Return JSON only, no explanation.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      let content = response.choices[0].message.content.trim();
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();

      const block = JSON.parse(content);

      return block;
    } catch (error) {
      console.error('Error generating block:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Function: Translate Block Instruction to Thai
exports.translateBlockToThai = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 30 })
  .https.onCall(async (data, context) => {
    const { blockName, instruction } = data;

    if (!blockName || !instruction) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing blockName or instruction');
    }

    try {
      const openai = getOpenAI();

      const systemPrompt = `คุณเป็นผู้ช่วยอธิบาย Block ให้ผู้ใช้เข้าใจ พูดแบบเป็นกันเอง เหมือนเพื่อนคุยกัน

=== บทบาทของคุณ ===
คุณเป็น "พี่แนะนำ" ที่จะอธิบายให้ผู้ใช้เข้าใจว่า Block นี้ทำอะไรได้บ้าง
พูดแบบเป็นกันเอง ใช้ภาษาบ้านๆ แต่ยังคงความถูกต้องของข้อมูล

=== รูปแบบการตอบ ===
- เริ่มต้นด้วย "สวัสดีครับ" หรือ "เฮ้ครับ"
- แนะนำชื่อ Block ก่อน
- อธิบายว่ามันทำอะไรได้แบบภาษาง่ายๆ
- ถ้าเหมาะกับงานแบบไหน ก็แนะนำเพิ่ม
- จบด้วยคำชวนใช้งาน เช่น "ลองใช้ดูนะครับ" หรือ "แนะนำเลยครับ"
- ความยาว 3-4 ประโยค พอดีๆ
- ห้ามใช้ภาษาอังกฤษ ห้ามใช้คำเทคนิค

=== ตัวอย่าง ===
Block: "🇰🇷 ภาษาเกาหลี"
Instruction: "Translate all dialogues and text into Korean. Ensure appropriate cultural nuances and expressions are maintained."
ตอบ: "สวัสดีครับ นี่คือบล็อกภาษาเกาหลีครับ ถ้าคุณใส่บล็อกนี้เข้าไป วิดีโอของคุณจะพูดภาษาเกาหลีได้เลย แถมยังคำนึงถึงวัฒนธรรมเกาหลีด้วยนะครับ แนะนำเลยครับถ้าอยากทำคอนเทนต์ให้คนเกาหลีดู"

Block: "🎬 ซีนีมาติก"
Instruction: "Apply cinematic color grading with dramatic lighting. Use wide shots and smooth camera movements."
ตอบ: "เฮ้ครับ บล็อกนี้ชื่อซีนีมาติกครับ ใส่ปุ๊บ วิดีโอของคุณจะดูเหมือนหนังฮอลลีวูดเลย มีแสงสีสวยๆ มุมกล้องกว้างๆ ดูอลังการมาก เหมาะกับคนที่อยากให้งานดูพรีเมียมครับ"

ตอบเป็นข้อความภาษาไทยเท่านั้น ไม่ต้องมี JSON`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Block: "${blockName}"\nInstruction: "${instruction}"` }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const thaiDescription = response.choices[0].message.content.trim();

      return { thaiDescription };
    } catch (error) {
      console.error('Error translating block:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// ============================================
// CONTENT PIPELINE FUNCTIONS
// ============================================

// Function: Generate Episodes from Topic (AI Episode Director)
exports.generateEpisodes = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { prompt } = data;
    if (!prompt) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing prompt');
    }

    try {
      const openai = getOpenAI();
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI Episode Director. Create an episode list for video content.
            
            Rules:
            - Generate 5-15 episodes based on the user's topic
            - Each episode should have a clear, engaging title
            - Include a brief description (1-2 sentences)
            - Make episodes progressive (build on each other)
            - Titles should be catchy and YouTube-friendly
            
            Output JSON format:
            {
              "episodes": [
                { "title": "Episode Title", "description": "Brief description" },
                ...
              ]
            }
            
            IMPORTANT: Output valid JSON only, no markdown.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 2000
      });

      let content = response.choices[0].message.content;
      content = content.replace(/```json/g, '').replace(/```/g, '').trim();

      const result = JSON.parse(content);
      return { episodes: result.episodes };
    } catch (error) {
      console.error('Error generating episodes:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Function: Expand Episode to Full Prompts (Episode + Mode Template + Expander)
exports.expandEpisodeToPrompts = functions
  .runWith({ timeoutSeconds: 120, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const userId = context.auth.uid;
    const { projectId, episodeId } = data;

    if (!projectId || !episodeId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing projectId or episodeId');
    }

    try {
      const db = admin.firestore();

      // 1. Get Episode
      const episodeDoc = await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('episodes').doc(episodeId)
        .get();

      if (!episodeDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Episode not found');
      }
      const episode = episodeDoc.data();

      // 2. Get Project (to get modeId and expanderId)
      const projectDoc = await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .get();

      if (!projectDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Project not found');
      }
      const project = projectDoc.data();

      // 3. Get Mode Template
      let modeBlocks = [];
      if (project.executionModeId) {
        const modeDoc = await db
          .collection('users').doc(userId)
          .collection('modes').doc(project.executionModeId)
          .get();

        if (modeDoc.exists) {
          const mode = modeDoc.data();
          modeBlocks = mode.blocks || [];
        }
      }

      // 4. Get Expander Blocks
      let expanderBlocks = [];
      if (project.expanderId) {
        // Check user's expanders first
        let expanderDoc = await db
          .collection('users').doc(userId)
          .collection('expanders').doc(project.expanderId)
          .get();

        // If not found, check purchased expanders
        if (!expanderDoc.exists) {
          expanderDoc = await db
            .collection('users').doc(userId)
            .collection('purchasedExpanders').doc(project.expanderId)
            .get();
        }

        if (expanderDoc.exists) {
          const expander = expanderDoc.data();
          expanderBlocks = expander.blocks || [];
        }
      }

      // 5. Build Scene Templates (replace [TOPIC] with episode title)
      const sceneTemplates = modeBlocks.map((block, idx) => {
        const evolution = block.evolution || [];
        return evolution.map((step, stepIdx) => {
          // Replace [TOPIC] placeholder with actual episode title
          let template = step.rawPrompt || '';
          template = template.replace(/\[TOPIC\]/gi, episode.title);
          return {
            sceneNumber: idx + 1,
            stepNumber: stepIdx + 1,
            simplePrompt: template || `${episode.title} - ฉาก ${idx + 1}`,
            percentage: step.stepPercentage || 0
          };
        });
      }).flat();

      // 6. Build Expander Block Instructions (same format as expandPrompt function)
      const blockInstructions = expanderBlocks.map((b, i) =>
        `${i + 1}. ${b.name}: ${b.instruction || b.description || ''}`
      ).join('\n');

      // 7. Expand EACH scene using Expander (same logic as expandPrompt)
      const openai = getOpenAI();
      const expandedPrompts = [];

      for (let i = 0; i < sceneTemplates.length; i++) {
        const scene = sceneTemplates[i];

        const systemPrompt = `You are a Premium Prompt Expander for AI video generation (Google Flow / Veo).

Your job is to expand a simple prompt into a detailed, cinematic prompt.

=== ACTIVE BLOCKS (User selected these rules) ===
${blockInstructions || 'Standard cinematic style'}

=== OUTPUT RULES ===
1. Write in English (required for Google Flow)
2. For Thai names, include original in parentheses: "Bas (บาส)"
3. Include: character descriptions, emotions, lighting, camera angles, ambient sounds
4. Be cinematic and detailed
5. Keep it under 500 words
6. Apply ALL the block instructions above

=== FORMAT ===
Return ONLY the expanded prompt, no explanations.`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Expand this prompt: "${scene.simplePrompt}"` }
          ],
          temperature: 0.8,
          max_tokens: 1000
        });

        const expandedPrompt = response.choices[0].message.content.trim();

        expandedPrompts.push({
          sceneNumber: scene.sceneNumber,
          stepNumber: scene.stepNumber,
          originalPrompt: scene.simplePrompt,
          prompt: expandedPrompt,
          percentage: scene.percentage
        });
      }

      // 8. Generate title and caption
      const titleResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Generate a catchy video title and social media caption in Thai. Output JSON: {"title": "...", "caption": "..."}' },
          { role: 'user', content: `Topic: ${episode.title}\nDescription: ${episode.description || ''}` }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      let titleContent = titleResponse.choices[0].message.content;
      titleContent = titleContent.replace(/```json/g, '').replace(/```/g, '').trim();
      const titleData = JSON.parse(titleContent);

      const result = {
        prompts: expandedPrompts,
        title: titleData.title,
        caption: titleData.caption
      };

      // 8. Mark Episode as Completed
      await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('episodes').doc(episodeId)
        .update({
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          generatedPrompts: result.prompts
        });

      return result;
    } catch (error) {
      console.error('Error expanding episode:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// ============================================
// TEST PROMPT PIPELINE
// ============================================

// Function: Test full prompt pipeline (Mode + Expander → Full Prompts + Titles + Tags)
exports.testPromptPipeline = functions
  .runWith({ secrets: ['OPENAI_API_KEY'], timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const userId = context.auth.uid;
    const { projectId, sceneDuration: inputSceneDuration } = data;

    if (!projectId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing projectId');
    }

    try {
      const db = admin.firestore();
      const openai = getOpenAI();

      // 1. Get Project
      const projectDoc = await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .get();

      if (!projectDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Project not found');
      }
      const project = projectDoc.data();

      // 1.5. Get sceneDuration from slots or use input/default
      let sceneDuration = inputSceneDuration || 8; // default 8 seconds
      const slotsSnap = await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('slots').limit(1).get();

      if (!slotsSnap.empty) {
        const slotData = slotsSnap.docs[0].data();
        sceneDuration = slotData.sceneDuration || sceneDuration;
      }
      console.log(`📏 Scene Duration: ${sceneDuration} seconds`);

      // 2. Get Mode
      const modeId = project.executionModeId;
      if (!modeId) {
        throw new functions.https.HttpsError('failed-precondition', 'No Mode selected for this project');
      }

      const modeDoc = await db
        .collection('users').doc(userId)
        .collection('modes').doc(modeId)
        .get();

      if (!modeDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Mode not found');
      }
      const modeData = modeDoc.data();

      // 3. Get Expander (optional)
      let expanderBlocks = [];
      const expanderId = project.expanderId;
      if (expanderId) {
        const expanderDoc = await db
          .collection('users').doc(userId)
          .collection('expanders').doc(expanderId)
          .get();

        if (expanderDoc.exists) {
          const expanderData = expanderDoc.data();
          expanderBlocks = expanderData.blocks || [];
        }
      }

      // 3.5. Get Episode from Content Queue using SHARED HELPER
      // Read episode selection mode from project settings (default: sequential)
      const episodeSelectionMode = project.episodeSelection || 'sequential';
      const projectRef = db.collection('users').doc(userId).collection('projects').doc(projectId);
      
      // Use SHARED getNextEpisode helper (same logic as scheduleJobs)
      const episodeData = await getNextEpisode(projectRef, episodeSelectionMode);

      if (episodeData) {
        console.log(`📺 Episode Topic: "${episodeData.title}" (mode: ${episodeSelectionMode})`);
        // NOTE: We do NOT change episode status for Test - it stays 'pending'
      } else {
        console.log(`⚠️ No pending episodes, using Mode name as topic`);
      }

      // 4. Extract Scenes from Mode using SHARED HELPER
      const rawScenes = extractRawScenesFromMode(modeData);
      const characters = modeData.characters || [];

      if (rawScenes.length === 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Mode has no scenes. Add evolution steps to blocks.');
      }

      // Build Episode context
      const episodeTopic = episodeData?.title || modeData.name || 'Untitled Video';
      const episodeDesc = episodeData?.description || modeData.description || '';

      console.log(`📋 testPromptPipeline: Using SHARED LOGIC (per-scene expansion)`);
      console.log(`   Episode Topic: "${episodeTopic}"`);
      console.log(`   Raw Scenes: ${rawScenes.length}`);
      console.log(`   Expander Blocks: ${expanderBlocks.length}`);

      // 5. Use SHARED HELPER for per-scene expansion (same as Production)
      const expandedPrompts = await expandScenesWithTopic({
        rawScenes,
        expanderBlocks,
        episodeTopic,
        episodeDesc,
        characters,
        sceneDuration,
        modeCategory: modeData.category,
        systemInstruction: modeData.systemInstruction
      });

      // 6. Generate Titles and Tags using SHARED HELPER
      const titlesAndTags = await generateTitlesAndTags({
        episodeTopic,
        episodeDesc,
        modeCategory: modeData.category,
        expandedPrompts
      });

      // 7. Combine results
      const result = {
        prompts: expandedPrompts,
        titles: titlesAndTags.titles,
        tags: titlesAndTags.tags
      };

      // 7. Save Test Result to testLogs/ collection (separate from Project, with TTL)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // TTL: 7 days

      const testLogData = {
        prompts: result.prompts,
        titles: result.titles,
        tags: result.tags,
        episodeId: episodeData?.id || null,
        episodeTitle: episodeData?.title || null,
        modeId: modeId,
        modeName: modeData.name || 'Unknown',
        expanderId: expanderId || null,
        expanderBlockCount: expanderBlocks.length,
        sceneCount: rawScenes.length,
        sceneDuration: sceneDuration,
        totalDuration: rawScenes.length * sceneDuration,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt) // TTL field for cleanup
      };

      // Save to testLogs/ subcollection
      const testLogRef = await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('testLogs')
        .add(testLogData);

      console.log(`📝 Test log saved: ${testLogRef.id} (expires: ${expiresAt.toISOString()})`);

      // Also update lastPromptTest on Project for quick access
      await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .update({
          lastPromptTest: {
            ...result,
            testLogId: testLogRef.id,
            testedAt: admin.firestore.FieldValue.serverTimestamp(),
            modeId: modeId,
            modeName: modeData.name || 'Unknown',
            expanderId: expanderId || null,
            sceneCount: rawScenes.length,
            episodeId: episodeData?.id || null,
            episodeTitle: episodeData?.title || null
          }
        });

      // 8. Log the test with detailed info
      await db
        .collection('users').doc(userId)
        .collection('projects').doc(projectId)
        .collection('logs').add({
          message: `✅ Prompt Test: "${episodeTopic}" - Generated ${result.prompts?.length || 0} prompts`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          platform: 'SYSTEM',
          type: 'test',
          testLogId: testLogRef.id,
          sceneCount: rawScenes.length,
          sceneDuration: sceneDuration,
          totalLength: rawScenes.length * sceneDuration,
          topic: episodeTopic,
          modeId: modeId,
          modeName: modeData.name || 'Unknown'
        });

      console.log(`✅ Test Pipeline completed: ${result.prompts?.length || 0} prompts for project ${projectId}`);

      return {
        success: true,
        ...result,
        modeInfo: {
          id: modeId,
          name: modeData.name,
          sceneCount: rawScenes.length
        },
        expanderInfo: expanderId ? {
          id: expanderId,
          blockCount: expanderBlocks.length
        } : null
      };

    } catch (error) {
      console.error('Test Pipeline Error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// Function: Text-to-Speech using Google Cloud TTS (Thai voice)
exports.textToSpeechThai = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .https.onCall(async (data, context) => {
    const { text } = data;

    if (!text) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing text');
    }

    try {
      const client = new TextToSpeechClient();

      const request = {
        input: { text: text },
        voice: {
          languageCode: 'th-TH',
          name: 'th-TH-Chirp3-HD-Charon', // Thai male voice - Chirp HD (natural)
          ssmlGender: 'MALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: 0,
          speakingRate: 1.0
        }
      };

      const [response] = await client.synthesizeSpeech(request);

      // Return base64 encoded audio
      const audioBase64 = response.audioContent.toString('base64');

      return {
        audioBase64,
        mimeType: 'audio/mpeg'
      };
    } catch (error) {
      console.error('TTS Error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// ============================================
// AUTO-REFILL SYSTEM
// ============================================

/**
 * Auto-Generate Episodes when queue is running low
 * Called by scheduleJobs or manually via callable
 */
async function autoGenerateEpisodesInternal(params) {
  const { projectRef, userId, projectId, count = 10, prompt = '', historyContext = [] } = params;
  
  const openai = getOpenAI();
  const db = admin.firestore();

  // Build context from history
  const historyTitles = historyContext.length > 0
    ? historyContext.map((h, i) => `${i + 1}. ${h.title}`).join('\n')
    : 'No previous episodes';

  const systemPrompt = `You are an AI Episode Director for video content creation.

=== PREVIOUS EPISODES (for context/style) ===
${historyTitles}

=== USER INSTRUCTION ===
${prompt || 'Create engaging video episode topics that follow the established theme/style.'}

=== TASK ===
Generate ${count} NEW episode ideas that:
1. Follow the same theme/style as previous episodes (if any)
2. Are unique and not repetitive
3. Have catchy, engaging titles
4. Include brief descriptions

=== OUTPUT FORMAT (JSON) ===
{
  "episodes": [
    { "title": "Episode Title", "description": "Brief 1-2 sentence description" }
  ]
}

IMPORTANT: Output valid JSON only, no markdown.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate ${count} new episodes` }
      ],
      temperature: 0.8,
      max_tokens: 2000
    });

    let content = response.choices[0].message.content.trim();
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    const result = JSON.parse(content);
    const episodes = result.episodes || [];

    if (episodes.length === 0) {
      console.log(`⚠️ AI returned no episodes`);
      return { success: false, count: 0 };
    }

    // Get last order number
    const lastEpisodeSnap = await projectRef.collection('episodes')
      .orderBy('order', 'desc')
      .limit(1)
      .get();
    
    let lastOrder = 0;
    if (!lastEpisodeSnap.empty) {
      lastOrder = lastEpisodeSnap.docs[0].data().order || 0;
    }

    // Batch write new episodes
    const batch = db.batch();
    episodes.forEach((ep, i) => {
      const ref = projectRef.collection('episodes').doc();
      batch.set(ref, {
        title: ep.title,
        description: ep.description || '',
        order: lastOrder + i + 1,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'auto-refill'
      });
    });

    await batch.commit();

    // Log the auto-generation
    await projectRef.collection('logs').add({
      message: `🤖 Auto-Refill: Generated ${episodes.length} new episodes`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      platform: 'SYSTEM',
      type: 'auto-refill',
      episodeCount: episodes.length
    });

    console.log(`✅ Auto-generated ${episodes.length} new episodes for project ${projectId}`);

    return { success: true, count: episodes.length, episodes };

  } catch (error) {
    console.error('Auto-generate episodes error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// CLEANUP FUNCTION: Delete expired testLogs (TTL 7 days)
// Runs daily at 2:00 AM UTC
// ============================================
exports.cleanupExpiredTestLogs = functions.pubsub.schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    
    console.log('🧹 Starting cleanup of expired testLogs...');
    
    try {
      // Get all users
      const usersSnap = await db.collection('users').get();
      let totalDeleted = 0;

      for (const userDoc of usersSnap.docs) {
        const projectsSnap = await userDoc.ref.collection('projects').get();
        
        for (const projectDoc of projectsSnap.docs) {
          // Find expired testLogs
          const expiredLogs = await projectDoc.ref.collection('testLogs')
            .where('expiresAt', '<', now)
            .get();
          
          if (!expiredLogs.empty) {
            const batch = db.batch();
            expiredLogs.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += expiredLogs.size;
            console.log(`   Deleted ${expiredLogs.size} expired testLogs from project ${projectDoc.id}`);
          }
        }
      }
      
      console.log(`✅ Cleanup complete: Deleted ${totalDeleted} expired testLogs`);
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  });

// ============================================
// CLEANUP FUNCTION: Delete old episodeHistory (older than 7 days)
// WITH BACKUP: Saves to deletedBackups/ before deletion
// Runs daily at 3:00 AM UTC
// ============================================
exports.cleanupOldEpisodeHistory = functions.pubsub.schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
    
    console.log('🧹 Starting cleanup of old episodeHistory (>7 days)...');
    
    try {
      const usersSnap = await db.collection('users').get();
      let totalDeleted = 0;
      let totalBackedUp = 0;

      for (const userDoc of usersSnap.docs) {
        const projectsSnap = await userDoc.ref.collection('projects').get();
        
        for (const projectDoc of projectsSnap.docs) {
          const oldHistory = await projectDoc.ref.collection('episodeHistory')
            .where('usedAt', '<', cutoffTimestamp)
            .get();
          
          if (!oldHistory.empty) {
            // BACKUP before delete
            const backupData = oldHistory.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              deletedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
            
            await projectDoc.ref.collection('deletedBackups').add({
              type: 'episodeHistory',
              count: oldHistory.size,
              data: backupData,
              backedUpAt: admin.firestore.FieldValue.serverTimestamp()
            });
            totalBackedUp += oldHistory.size;

            // Delete
            const batch = db.batch();
            oldHistory.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += oldHistory.size;
            console.log(`   Backed up & deleted ${oldHistory.size} history entries from project ${projectDoc.id}`);
          }
        }
      }
      
      console.log(`✅ History cleanup complete: Backed up ${totalBackedUp}, Deleted ${totalDeleted}`);
    } catch (error) {
      console.error('❌ History cleanup error:', error);
    }
  });

// ============================================
// CLEANUP FUNCTION: Delete old logs (older than 7 days)
// Runs daily at 3:30 AM UTC
// ============================================
exports.cleanupOldLogs = functions.pubsub.schedule('30 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
    
    console.log('🧹 Starting cleanup of old logs (>7 days)...');
    
    try {
      const usersSnap = await db.collection('users').get();
      let totalDeleted = 0;

      for (const userDoc of usersSnap.docs) {
        const projectsSnap = await userDoc.ref.collection('projects').get();
        
        for (const projectDoc of projectsSnap.docs) {
          const oldLogs = await projectDoc.ref.collection('logs')
            .where('timestamp', '<', cutoffTimestamp)
            .get();
          
          if (!oldLogs.empty) {
            const batch = db.batch();
            oldLogs.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += oldLogs.size;
            console.log(`   Deleted ${oldLogs.size} old logs from project ${projectDoc.id}`);
          }
        }
      }
      
      console.log(`✅ Logs cleanup complete: Deleted ${totalDeleted} old entries`);
    } catch (error) {
      console.error('❌ Logs cleanup error:', error);
    }
  });

// ============================================
// CLEANUP FUNCTION: Delete old readyPrompts (older than 7 days)
// Runs daily at 4:00 AM UTC
// ============================================
exports.cleanupOldReadyPrompts = functions.pubsub.schedule('0 4 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
    
    console.log('🧹 Starting cleanup of old readyPrompts (>7 days)...');
    
    try {
      const usersSnap = await db.collection('users').get();
      let totalDeleted = 0;

      for (const userDoc of usersSnap.docs) {
        const projectsSnap = await userDoc.ref.collection('projects').get();
        
        for (const projectDoc of projectsSnap.docs) {
          const oldPrompts = await projectDoc.ref.collection('readyPrompts')
            .where('createdAt', '<', cutoffTimestamp)
            .get();
          
          if (!oldPrompts.empty) {
            const batch = db.batch();
            oldPrompts.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += oldPrompts.size;
            console.log(`   Deleted ${oldPrompts.size} old readyPrompts from project ${projectDoc.id}`);
          }
        }
      }
      
      console.log(`✅ ReadyPrompts cleanup complete: Deleted ${totalDeleted} old entries`);
    } catch (error) {
      console.error('❌ ReadyPrompts cleanup error:', error);
    }
  });

// ============================================
// CLEANUP FUNCTION: Delete old completed jobs (older than 7 days)
// Runs daily at 4:30 AM UTC
// ============================================
exports.cleanupOldJobs = functions.pubsub.schedule('30 4 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
    
    console.log('🧹 Starting cleanup of old jobs (>7 days)...');
    
    try {
      // Jobs are at root level: jobs/{jobId}
      const oldJobs = await db.collection('jobs')
        .where('createdAt', '<', cutoffTimestamp)
        .get();
      
      if (!oldJobs.empty) {
        let totalDeleted = 0;
        const batchSize = 500;
        const batches = [];
        let currentBatch = db.batch();
        let count = 0;

        oldJobs.docs.forEach(doc => {
          currentBatch.delete(doc.ref);
          count++;
          if (count >= batchSize) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            count = 0;
          }
        });
        if (count > 0) batches.push(currentBatch);

        for (const batch of batches) {
          await batch.commit();
        }
        totalDeleted = oldJobs.size;
        console.log(`✅ Jobs cleanup complete: Deleted ${totalDeleted} old jobs`);
      } else {
        console.log('✅ Jobs cleanup complete: No old jobs to delete');
      }
    } catch (error) {
      console.error('❌ Jobs cleanup error:', error);
    }
  });

// ============================================
// CLEANUP FUNCTION: Delete used episodes (status: 'used', older than 7 days)
// Runs daily at 5:00 AM UTC
// ============================================
exports.cleanupUsedEpisodes = functions.pubsub.schedule('0 5 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
    
    console.log('🧹 Starting cleanup of used episodes (>7 days)...');
    
    try {
      const usersSnap = await db.collection('users').get();
      let totalDeleted = 0;

      for (const userDoc of usersSnap.docs) {
        const projectsSnap = await userDoc.ref.collection('projects').get();
        
        for (const projectDoc of projectsSnap.docs) {
          const usedEpisodes = await projectDoc.ref.collection('episodes')
            .where('status', '==', 'used')
            .where('usedAt', '<', cutoffTimestamp)
            .get();
          
          if (!usedEpisodes.empty) {
            const batch = db.batch();
            usedEpisodes.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += usedEpisodes.size;
            console.log(`   Deleted ${usedEpisodes.size} used episodes from project ${projectDoc.id}`);
          }
        }
      }
      
      console.log(`✅ Used episodes cleanup complete: Deleted ${totalDeleted} old entries`);
    } catch (error) {
      console.error('❌ Used episodes cleanup error:', error);
    }
  });

// Callable function for manual trigger
exports.autoGenerateEpisodes = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const userId = context.auth.uid;
    const { projectId, count = 10, prompt = '' } = data;

    if (!projectId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing projectId');
    }

    const db = admin.firestore();
    const projectRef = db.collection('users').doc(userId).collection('projects').doc(projectId);

    // Check project exists
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Project not found');
    }

    // Get history for context
    const historySnap = await projectRef.collection('episodeHistory')
      .orderBy('usedAt', 'desc')
      .limit(20)
      .get();
    
    const historyContext = historySnap.docs.map(d => ({
      title: d.data().title,
      description: d.data().description
    }));

    const result = await autoGenerateEpisodesInternal({
      projectRef,
      userId,
      projectId,
      count,
      prompt,
      historyContext
    });

    if (!result.success) {
      throw new functions.https.HttpsError('internal', result.error || 'Failed to generate episodes');
    }

    return result;
  });

// ============================================
// MANUAL CLEANUP: Callable function for Admin
// Allows manual trigger of cleanup for a specific project
// ============================================
exports.manualCleanup = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const db = admin.firestore();
    const { allProjects, projectId, userId, targets = ['all'] } = data;
    // targets: ['logs', 'testLogs', 'readyPrompts', 'episodeHistory', 'usedEpisodes', 'all']

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);
    const shouldClean = (target) => targets.includes('all') || targets.includes(target);

    // Helper function to cleanup a single project
    const cleanupProject = async (targetUserId, targetProjectId) => {
      const projectRef = db.collection('users').doc(targetUserId).collection('projects').doc(targetProjectId);
      const results = { logs: 0, testLogs: 0, readyPrompts: 0, episodeHistory: 0, usedEpisodes: 0, backedUp: 0 };

      // 1. Cleanup logs
      if (shouldClean('logs')) {
        const oldLogs = await projectRef.collection('logs').where('timestamp', '<', cutoffTimestamp).get();
        if (!oldLogs.empty) {
          const batch = db.batch();
          oldLogs.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          results.logs = oldLogs.size;
        }
      }
      // 2. Cleanup testLogs
      if (shouldClean('testLogs')) {
        const now = admin.firestore.Timestamp.now();
        const expiredLogs = await projectRef.collection('testLogs').where('expiresAt', '<', now).get();
        if (!expiredLogs.empty) {
          const batch = db.batch();
          expiredLogs.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          results.testLogs = expiredLogs.size;
        }
      }
      // 3. Cleanup readyPrompts
      if (shouldClean('readyPrompts')) {
        const oldPrompts = await projectRef.collection('readyPrompts').where('createdAt', '<', cutoffTimestamp).get();
        if (!oldPrompts.empty) {
          const batch = db.batch();
          oldPrompts.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          results.readyPrompts = oldPrompts.size;
        }
      }
      // 4. Cleanup episodeHistory
      if (shouldClean('episodeHistory')) {
        const oldHistory = await projectRef.collection('episodeHistory').where('usedAt', '<', cutoffTimestamp).get();
        if (!oldHistory.empty) {
          const batch = db.batch();
          oldHistory.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          results.episodeHistory = oldHistory.size;
        }
      }
      // 5. Cleanup used episodes
      if (shouldClean('usedEpisodes')) {
        const usedEpisodes = await projectRef.collection('episodes').where('status', '==', 'used').where('usedAt', '<', cutoffTimestamp).get();
        if (!usedEpisodes.empty) {
          const batch = db.batch();
          usedEpisodes.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          results.usedEpisodes = usedEpisodes.size;
        }
      }
      return results;
    };

    try {
      // Mode: All Projects
      if (allProjects && Array.isArray(allProjects)) {
        const totals = { logs: 0, testLogs: 0, readyPrompts: 0, episodeHistory: 0, usedEpisodes: 0, projectsCleaned: 0 };
        for (const proj of allProjects) {
          try {
            const r = await cleanupProject(proj.userId, proj.projectId);
            totals.logs += r.logs;
            totals.testLogs += r.testLogs;
            totals.readyPrompts += r.readyPrompts;
            totals.episodeHistory += r.episodeHistory;
            totals.usedEpisodes += r.usedEpisodes;
            totals.projectsCleaned++;
          } catch (e) { /* skip invalid */ }
        }
        const totalDeleted = totals.logs + totals.testLogs + totals.readyPrompts + totals.episodeHistory + totals.usedEpisodes;
        return { success: true, deleted: totals, message: `ล้างทุกโปรเจค (${totals.projectsCleaned}) เสร็จสิ้น ลบทั้งหมด ${totalDeleted} รายการ` };
      }

      // Mode: Single Project
      const targetUserId = userId || context.auth.uid;
      if (!projectId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing projectId');
      }
      const projectRef = db.collection('users').doc(targetUserId).collection('projects').doc(projectId);
      const projectDoc = await projectRef.get();
      if (!projectDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Project not found');
      }

      const results = await cleanupProject(targetUserId, projectId);

      // Log the manual cleanup
      await projectRef.collection('logs').add({
        message: `🧹 Manual Cleanup: Deleted ${results.logs + results.testLogs + results.readyPrompts + results.episodeHistory + results.usedEpisodes} items`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        platform: 'SYSTEM',
        type: 'cleanup',
        details: results
      });

      return {
        success: true,
        deleted: results,
        message: `Cleanup completed. Total deleted: ${Object.values(results).reduce((a, b) => a + b, 0)}`
      };

    } catch (error) {
      console.error('Manual cleanup error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// ============================================
// STORAGE STATS: Get document counts for Admin Dashboard
// ============================================
exports.getStorageStats = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const db = admin.firestore();
    const { allProjects, projectId, userId } = data;

    // Helper function to get stats for a single project
    const getProjectStats = async (targetUserId, targetProjectId) => {
      const projectRef = db.collection('users').doc(targetUserId).collection('projects').doc(targetProjectId);
      const [episodesSnap, episodeHistorySnap, logsSnap, testLogsSnap, readyPromptsSnap, slotsSnap, deletedBackupsSnap] = await Promise.all([
        projectRef.collection('episodes').get(),
        projectRef.collection('episodeHistory').get(),
        projectRef.collection('logs').get(),
        projectRef.collection('testLogs').get(),
        projectRef.collection('readyPrompts').get(),
        projectRef.collection('slots').get(),
        projectRef.collection('deletedBackups').get()
      ]);

      let pendingEpisodes = 0, usedEpisodes = 0, oldLogs = 0, oldHistory = 0;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      episodesSnap.docs.forEach(doc => {
        if (doc.data().status === 'pending') pendingEpisodes++;
        else if (doc.data().status === 'used') usedEpisodes++;
      });
      logsSnap.docs.forEach(doc => {
        const ts = doc.data().timestamp?.toDate?.();
        if (ts && ts < sevenDaysAgo) oldLogs++;
      });
      episodeHistorySnap.docs.forEach(doc => {
        const ts = doc.data().usedAt?.toDate?.();
        if (ts && ts < sevenDaysAgo) oldHistory++;
      });

      return {
        episodes: { total: episodesSnap.size, pending: pendingEpisodes, used: usedEpisodes },
        episodeHistory: { total: episodeHistorySnap.size, oldItems: oldHistory },
        logs: { total: logsSnap.size, oldItems: oldLogs },
        testLogs: testLogsSnap.size,
        readyPrompts: readyPromptsSnap.size,
        slots: slotsSnap.size,
        deletedBackups: deletedBackupsSnap.size,
        cleanup: { logs: oldLogs, episodeHistory: oldHistory, usedEpisodes }
      };
    };

    try {
      // Mode: All Projects (aggregate stats)
      if (allProjects && Array.isArray(allProjects)) {
        const totals = { episodes: { total: 0, pending: 0, used: 0 }, episodeHistory: { total: 0, oldItems: 0 }, logs: { total: 0, oldItems: 0 }, testLogs: 0, readyPrompts: 0, slots: 0, deletedBackups: 0 };
        const cleanup = { logs: 0, episodeHistory: 0, usedEpisodes: 0 };

        for (const proj of allProjects) {
          try {
            const stats = await getProjectStats(proj.userId, proj.projectId);
            totals.episodes.total += stats.episodes.total;
            totals.episodes.pending += stats.episodes.pending;
            totals.episodes.used += stats.episodes.used;
            totals.episodeHistory.total += stats.episodeHistory.total;
            totals.episodeHistory.oldItems += stats.episodeHistory.oldItems;
            totals.logs.total += stats.logs.total;
            totals.logs.oldItems += stats.logs.oldItems;
            totals.testLogs += stats.testLogs;
            totals.readyPrompts += stats.readyPrompts;
            totals.slots += stats.slots;
            totals.deletedBackups += stats.deletedBackups;
            cleanup.logs += stats.cleanup.logs;
            cleanup.episodeHistory += stats.cleanup.episodeHistory;
            cleanup.usedEpisodes += stats.cleanup.usedEpisodes;
          } catch (e) { /* skip invalid projects */ }
        }
        return { success: true, stats: totals, cleanupEstimate: cleanup, projectCount: allProjects.length };
      }

      // Mode: Single Project
      const targetUserId = userId || context.auth.uid;
      if (!projectId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing projectId');
      }
      const stats = await getProjectStats(targetUserId, projectId);
      return { success: true, stats, cleanupEstimate: stats.cleanup };

    } catch (error) {
      console.error('Get storage stats error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

// ============================================
// AI BLOCK EDITOR: Chat with AI to edit Blocks
// ============================================
exports.aiBlockEditor = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { message, blockData, chatHistory, editMode } = data;
    const openai = getOpenAI();

    const systemPrompt = `คุณคือ AI ผู้ช่วยแก้ไข Automation Block สำหรับ Chrome Extension
คุณต้องพูดคุยกับ Admin เป็นภาษาไทยเพื่อเก็บข้อมูลให้ครบถ้วนก่อนทำการแก้ไข

**หน้าที่ของคุณ:**
1. ถามคำถามเพื่อเข้าใจปัญหาและความต้องการของ Admin
2. วิเคราะห์ Block Data ที่ได้รับ
3. เสนอแนะการแก้ไขที่เหมาะสม
4. เมื่อ Admin ยืนยัน ให้ส่ง JSON สำหรับแก้ไข Block

**ตัวแปรที่ใช้ได้:**
- {{prompt}} - ข้อความ Prompt ของซีน
- {{title}} - ชื่อเรื่อง
- {{tags}} - แท็ก/คีย์เวิร์ด
- {{sceneIndex}} - ลำดับของซีน (1, 2, 3...)

**รูปแบบ Block Step:**
{
  "action": "click" | "type" | "select",
  "selector": "CSS selector ของ element",
  "value": "ข้อความที่จะพิมพ์ (สำหรับ type)",
  "description": "คำอธิบาย step นี้"
}

**กฎสำคัญ:**
- ห้ามเดาการแก้ไข ต้องถามข้อมูลให้ครบก่อน
- เมื่อพร้อมแก้ไข ให้ส่ง JSON ในรูปแบบ:
\`\`\`json
{"action": "UPDATE_BLOCK", "steps": [...], "changes": "สรุปการเปลี่ยนแปลง"}
\`\`\`
- ถ้ายังไม่พร้อม ให้ถามคำถามเพิ่มเติม`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Block Data:\n${JSON.stringify(blockData, null, 2)}\n\nEdit Mode: ${editMode}` }
      ];

      // Add chat history
      if (chatHistory && Array.isArray(chatHistory)) {
        chatHistory.forEach(msg => {
          messages.push({ role: msg.role, content: msg.content });
        });
      }

      // Add current message
      messages.push({ role: 'user', content: message });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      });

      const aiResponse = response.choices[0].message.content;

      // Check if AI wants to update block
      let updateAction = null;
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.action === 'UPDATE_BLOCK') {
            updateAction = parsed;
          }
        } catch (e) {
          // JSON parse failed, just return text response
        }
      }

      return {
        success: true,
        response: aiResponse,
        updateAction: updateAction
      };

    } catch (error) {
      console.error('AI Block Editor error:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

