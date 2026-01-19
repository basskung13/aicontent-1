/**
 * Test Runner for Content Queue & Prompt Pipeline
 * ใช้สำหรับทดสอบ Firebase Functions ผ่าน Firebase Admin SDK
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (ใช้ service account หรือ default credentials)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Test Configuration
const TEST_USER_ID = process.env.TEST_USER_ID || 'TEST_USER_PLACEHOLDER';
const TEST_PROJECT_ID = process.env.TEST_PROJECT_ID || 'TEST_PROJECT_PLACEHOLDER';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(type, message) {
  const timestamp = new Date().toISOString();
  const color = {
    'PASS': colors.green,
    'FAIL': colors.red,
    'INFO': colors.blue,
    'WARN': colors.yellow,
    'TEST': colors.cyan
  }[type] || colors.reset;
  
  console.log(`${color}[${type}]${colors.reset} ${timestamp} - ${message}`);
}

// ============================================
// TEST CASE: TC-BE-01 - testPromptPipeline
// ============================================
async function testTC_BE_01() {
  log('TEST', '=== TC-BE-01: testPromptPipeline ===');
  
  try {
    const projectRef = db.collection('users').doc(TEST_USER_ID)
      .collection('projects').doc(TEST_PROJECT_ID);
    
    // 1. Check testLogs collection
    const testLogsSnap = await projectRef.collection('testLogs')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (testLogsSnap.empty) {
      log('WARN', 'No testLogs found. Please run testPromptPipeline from UI first.');
      return { pass: false, reason: 'No testLogs found' };
    }
    
    const testLog = testLogsSnap.docs[0].data();
    
    // 2. Verify required fields
    const requiredFields = ['prompts', 'titles', 'tags', 'createdAt', 'expiresAt'];
    const missingFields = requiredFields.filter(f => !testLog[f]);
    
    if (missingFields.length > 0) {
      log('FAIL', `Missing fields in testLogs: ${missingFields.join(', ')}`);
      return { pass: false, reason: `Missing fields: ${missingFields.join(', ')}` };
    }
    
    // 3. Verify expiresAt is ~7 days from createdAt
    const createdAt = testLog.createdAt.toDate();
    const expiresAt = testLog.expiresAt.toDate();
    const diffDays = (expiresAt - createdAt) / (1000 * 60 * 60 * 24);
    
    if (diffDays < 6 || diffDays > 8) {
      log('FAIL', `expiresAt is not ~7 days from createdAt (diff: ${diffDays.toFixed(1)} days)`);
      return { pass: false, reason: 'Invalid TTL' };
    }
    
    // 4. Verify episode data if present
    if (testLog.episodeId) {
      log('INFO', `Episode used: "${testLog.episodeTitle}" (${testLog.episodeId})`);
      
      // Check episode status is still pending
      const episodeDoc = await projectRef.collection('episodes').doc(testLog.episodeId).get();
      if (episodeDoc.exists) {
        const episodeStatus = episodeDoc.data().status;
        if (episodeStatus !== 'pending') {
          log('WARN', `Episode status is "${episodeStatus}" (expected: pending for test)`);
        }
      }
    }
    
    log('PASS', `TC-BE-01 PASSED - testLogs created with ${testLog.prompts?.length || 0} prompts, TTL: ${diffDays.toFixed(1)} days`);
    return { pass: true };
    
  } catch (error) {
    log('FAIL', `TC-BE-01 ERROR: ${error.message}`);
    return { pass: false, reason: error.message };
  }
}

// ============================================
// TEST CASE: TC-BE-02 - scheduleJobs
// ============================================
async function testTC_BE_02() {
  log('TEST', '=== TC-BE-02: scheduleJobs ===');
  
  try {
    const projectRef = db.collection('users').doc(TEST_USER_ID)
      .collection('projects').doc(TEST_PROJECT_ID);
    
    // 1. Check readyPrompts collection
    const readyPromptsSnap = await projectRef.collection('readyPrompts')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (readyPromptsSnap.empty) {
      log('WARN', 'No readyPrompts found. Schedule may not have triggered yet.');
      return { pass: false, reason: 'No readyPrompts found' };
    }
    
    const readyPrompt = readyPromptsSnap.docs[0].data();
    
    // 2. Verify required fields
    const requiredFields = ['prompts', 'status', 'createdAt'];
    const missingFields = requiredFields.filter(f => !readyPrompt[f]);
    
    if (missingFields.length > 0) {
      log('FAIL', `Missing fields in readyPrompts: ${missingFields.join(', ')}`);
      return { pass: false, reason: `Missing fields: ${missingFields.join(', ')}` };
    }
    
    // 3. Check episodeHistory
    const historySnap = await projectRef.collection('episodeHistory')
      .orderBy('usedAt', 'desc')
      .limit(1)
      .get();
    
    if (historySnap.empty) {
      log('WARN', 'No episodeHistory found');
    } else {
      const history = historySnap.docs[0].data();
      log('INFO', `Episode in history: "${history.title}" (jobId: ${history.jobId || 'N/A'})`);
      
      // Verify history has required fields
      if (!history.usedAt || !history.generatedPrompts) {
        log('WARN', 'episodeHistory missing usedAt or generatedPrompts');
      }
    }
    
    log('PASS', `TC-BE-02 PASSED - readyPrompts created, status: ${readyPrompt.status}`);
    return { pass: true };
    
  } catch (error) {
    log('FAIL', `TC-BE-02 ERROR: ${error.message}`);
    return { pass: false, reason: error.message };
  }
}

// ============================================
// TEST CASE: TC-BE-05 - Auto-Refill Check
// ============================================
async function testTC_BE_05() {
  log('TEST', '=== TC-BE-05: Auto-Refill System ===');
  
  try {
    const projectRef = db.collection('users').doc(TEST_USER_ID)
      .collection('projects').doc(TEST_PROJECT_ID);
    
    // 1. Get project settings
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
      log('FAIL', 'Project not found');
      return { pass: false, reason: 'Project not found' };
    }
    
    const project = projectDoc.data();
    log('INFO', `Auto-Refill Enabled: ${project.autoRefillEnabled || false}`);
    log('INFO', `Threshold: ${project.autoRefillThreshold || 5}`);
    log('INFO', `Count: ${project.autoRefillCount || 10}`);
    
    // 2. Count pending episodes
    const pendingSnap = await projectRef.collection('episodes')
      .where('status', '==', 'pending')
      .get();
    
    log('INFO', `Pending Episodes: ${pendingSnap.size}`);
    
    // 3. Check for auto-refill logs
    const refillLogs = await projectRef.collection('logs')
      .where('type', '==', 'auto-refill')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    if (!refillLogs.empty) {
      log('INFO', `Found ${refillLogs.size} auto-refill log(s)`);
      refillLogs.docs.forEach(doc => {
        const data = doc.data();
        log('INFO', `  - ${data.message} (${data.episodeCount || 0} episodes)`);
      });
    }
    
    // 4. Check for auto-generated episodes
    const autoGenerated = await projectRef.collection('episodes')
      .where('createdBy', '==', 'auto-refill')
      .get();
    
    log('INFO', `Auto-generated Episodes: ${autoGenerated.size}`);
    
    if (project.autoRefillEnabled && pendingSnap.size < (project.autoRefillThreshold || 5)) {
      if (autoGenerated.size > 0 || !refillLogs.empty) {
        log('PASS', 'TC-BE-05 PASSED - Auto-refill system is working');
        return { pass: true };
      } else {
        log('WARN', 'Episodes below threshold but no auto-refill triggered yet');
        return { pass: false, reason: 'Auto-refill not triggered' };
      }
    }
    
    log('PASS', `TC-BE-05 PASSED - Auto-refill settings verified`);
    return { pass: true };
    
  } catch (error) {
    log('FAIL', `TC-BE-05 ERROR: ${error.message}`);
    return { pass: false, reason: error.message };
  }
}

// ============================================
// MAIN RUNNER
// ============================================
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  Content Queue & Prompt Pipeline - Test Runner');
  console.log('='.repeat(60) + '\n');
  
  log('INFO', `Test User ID: ${TEST_USER_ID}`);
  log('INFO', `Test Project ID: ${TEST_PROJECT_ID}`);
  console.log('');
  
  const results = {
    'TC-BE-01': await testTC_BE_01(),
    'TC-BE-02': await testTC_BE_02(),
    'TC-BE-05': await testTC_BE_05()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(60));
  
  let passCount = 0;
  let failCount = 0;
  
  for (const [testId, result] of Object.entries(results)) {
    const status = result.pass ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`  ${testId}: ${status}${result.reason ? ` (${result.reason})` : ''}`);
    if (result.pass) passCount++; else failCount++;
  }
  
  console.log('');
  console.log(`  Total: ${passCount} passed, ${failCount} failed`);
  console.log('='.repeat(60) + '\n');
  
  return results;
}

// Export for use in other scripts
module.exports = { runAllTests, testTC_BE_01, testTC_BE_02, testTC_BE_05 };

// Run if called directly
if (require.main === module) {
  runAllTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}
