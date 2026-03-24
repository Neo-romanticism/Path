'use strict';

let roomChatSchemaReady = false;

async function ensureRoomChatSchema(db) {
    if (roomChatSchemaReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS study_room_messages (
            id          SERIAL PRIMARY KEY,
            room_id     INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content     VARCHAR(500) NOT NULL,
            created_at  TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_study_room_messages_room ON study_room_messages(room_id, created_at);
    `);

    roomChatSchemaReady = true;
}

module.exports = {
    ensureRoomChatSchema,
};