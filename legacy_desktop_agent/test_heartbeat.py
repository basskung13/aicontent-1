import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

project_id = '2pZgyY7Qunr7yXBECknw'

try:
    db.collection('agent_status').document(project_id).set({
        'projectId': project_id,
        'status': 'online',
        'lastSeen': firestore.SERVER_TIMESTAMP,
        'version': '2.1'
    }, merge=True)
    print(f"SUCCESS: Heartbeat sent to agent_status/{project_id}")
except Exception as e:
    print(f"ERROR: {e}")
