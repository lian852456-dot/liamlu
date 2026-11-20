// SQLite adapter for the isolated staff-control candidate.  This creates only
// candidate-owned staff_control_* tables; callers must use a fresh/staged DB,
// never a live product database without an explicit migration decision.
export const STAFF_CONTROL_SCHEMA=`
CREATE TABLE IF NOT EXISTS staff_control_leases(
  owner_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, state TEXT NOT NULL,
  epoch INTEGER NOT NULL, connected_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  grace_until INTEGER
);
CREATE TABLE IF NOT EXISTS staff_control_poses(owner_id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS staff_control_appearance(owner_id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS staff_control_requests(
  owner_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  response TEXT NOT NULL, PRIMARY KEY(owner_id,request_id)
);`;

const json=value=>JSON.stringify(value);
const parse=value=>JSON.parse(value);

export function createSqliteStaffAdapter(db,{ensureSchema=true}={}){
  if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function')throw new TypeError('SQLITE_DB_REQUIRED');
  if(ensureSchema)db.exec(STAFF_CONTROL_SCHEMA);
  return {
    transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}},
    readLease(ownerId){const row=db.prepare('SELECT * FROM staff_control_leases WHERE owner_id=?').get(ownerId);return row&&{ownerId:row.owner_id,sessionId:row.session_id,state:row.state,epoch:row.epoch,connectedAt:row.connected_at,lastSeen:row.last_seen,graceUntil:row.grace_until};},
    writeLease(ownerId,value){if(value==null){db.prepare('DELETE FROM staff_control_leases WHERE owner_id=?').run(ownerId);return;}db.prepare('INSERT OR REPLACE INTO staff_control_leases(owner_id,session_id,state,epoch,connected_at,last_seen,grace_until) VALUES(?,?,?,?,?,?,?)').run(ownerId,value.sessionId,value.state,value.epoch,value.connectedAt,value.lastSeen,value.graceUntil??null);},
    readPose(ownerId){const row=db.prepare('SELECT body FROM staff_control_poses WHERE owner_id=?').get(ownerId);return row?parse(row.body):null;},
    writePose(ownerId,value){db.prepare('INSERT OR REPLACE INTO staff_control_poses(owner_id,body) VALUES(?,?)').run(ownerId,json(value));},
    readAppearance(ownerId){const row=db.prepare('SELECT body FROM staff_control_appearance WHERE owner_id=?').get(ownerId);return row?parse(row.body):null;},
    writeAppearance(ownerId,value){db.prepare('INSERT OR REPLACE INTO staff_control_appearance(owner_id,body) VALUES(?,?)').run(ownerId,json(value));},
    readRequest(ownerId,requestId){const row=db.prepare('SELECT fingerprint,response FROM staff_control_requests WHERE owner_id=? AND request_id=?').get(ownerId,requestId);return row?{fingerprint:row.fingerprint,response:parse(row.response)}:null;},
    writeRequest(ownerId,requestId,value){db.prepare('INSERT INTO staff_control_requests(owner_id,request_id,fingerprint,response) VALUES(?,?,?,?)').run(ownerId,requestId,value.fingerprint,json(value.response));},
  };
}
