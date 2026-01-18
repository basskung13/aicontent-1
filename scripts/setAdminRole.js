/**
 * One-time script to set role=admin for specific user by email
 * Run: node scripts/setAdminRole.js
 * 
 * Prerequisites:
 * - Firebase Admin SDK initialized
 * - Service account key or default credentials
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (uses default credentials from environment or service account)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'content-auto-post'
    });
}

const db = admin.firestore();

const TARGET_EMAIL = 'fxfarm.dashboard@gmail.com';

async function setAdminRole() {
    console.log(`🔍 Searching for user with email: ${TARGET_EMAIL}`);
    
    try {
        // Query users collection for matching email
        const usersSnapshot = await db.collection('users')
            .where('email', '==', TARGET_EMAIL)
            .limit(1)
            .get();
        
        if (usersSnapshot.empty) {
            console.log('❌ User not found in Firestore. Checking Firebase Auth...');
            
            // Try to get user from Firebase Auth
            try {
                const userRecord = await admin.auth().getUserByEmail(TARGET_EMAIL);
                console.log(`✅ Found in Auth: UID = ${userRecord.uid}`);
                
                // Create/update user document with admin role
                await db.collection('users').doc(userRecord.uid).set({
                    email: TARGET_EMAIL,
                    role: 'admin',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                console.log(`✅ Set role=admin for UID: ${userRecord.uid}`);
                
            } catch (authError) {
                console.error('❌ User not found in Firebase Auth either:', authError.message);
                console.log('\n⚠️ User must sign in at least once before setting admin role.');
            }
            return;
        }
        
        // User found in Firestore
        const userDoc = usersSnapshot.docs[0];
        const uid = userDoc.id;
        const userData = userDoc.data();
        
        console.log(`✅ Found user: ${uid}`);
        console.log(`   Current role: ${userData.role || 'none'}`);
        
        // Update role to admin
        await db.collection('users').doc(uid).update({
            role: 'admin',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Successfully set role=admin for ${TARGET_EMAIL} (UID: ${uid})`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    process.exit(0);
}

setAdminRole();
