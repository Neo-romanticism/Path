'use strict';

const ROOM_ROLE = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  MEMBER: 'member',
});

const ROOM_PERMISSION = Object.freeze({
  EDIT_SETTINGS: 'edit_settings',
  MANAGE_MEMBERS: 'manage_members',
  MANAGE_DECOR: 'manage_decor',
  DELETE_ROOM: 'delete_room',
  ASSIGN_ROLES: 'assign_roles',
});

const ROOM_ROLE_PERMISSIONS = Object.freeze({
  [ROOM_ROLE.OWNER]: Object.freeze({
    [ROOM_PERMISSION.EDIT_SETTINGS]: true,
    [ROOM_PERMISSION.MANAGE_MEMBERS]: true,
    [ROOM_PERMISSION.MANAGE_DECOR]: true,
    [ROOM_PERMISSION.DELETE_ROOM]: true,
    [ROOM_PERMISSION.ASSIGN_ROLES]: true,
  }),
  [ROOM_ROLE.MANAGER]: Object.freeze({
    [ROOM_PERMISSION.EDIT_SETTINGS]: true,
    [ROOM_PERMISSION.MANAGE_MEMBERS]: true,
    [ROOM_PERMISSION.MANAGE_DECOR]: true,
    [ROOM_PERMISSION.DELETE_ROOM]: false,
    [ROOM_PERMISSION.ASSIGN_ROLES]: false,
  }),
  [ROOM_ROLE.MEMBER]: Object.freeze({
    [ROOM_PERMISSION.EDIT_SETTINGS]: false,
    [ROOM_PERMISSION.MANAGE_MEMBERS]: false,
    [ROOM_PERMISSION.MANAGE_DECOR]: false,
    [ROOM_PERMISSION.DELETE_ROOM]: false,
    [ROOM_PERMISSION.ASSIGN_ROLES]: false,
  }),
});

function hasRoomPermission(role, permission) {
  return Boolean(ROOM_ROLE_PERMISSIONS[role] && ROOM_ROLE_PERMISSIONS[role][permission]);
}

function roomRoleRank(role) {
  if (role === ROOM_ROLE.OWNER) return 3;
  if (role === ROOM_ROLE.MANAGER) return 2;
  return 1;
}

function getRoomPermissions(role) {
  return ROOM_ROLE_PERMISSIONS[role] || ROOM_ROLE_PERMISSIONS[ROOM_ROLE.MEMBER];
}

async function getRoomRole(clientOrPool, roomId, userId) {
  const roleRes = await clientOrPool.query(
    `SELECT COALESCE(rr.role,
                        CASE WHEN r.creator_id = m.user_id THEN 'owner' ELSE 'member' END) AS role
         FROM study_room_members m
         JOIN study_rooms r ON r.id = m.room_id
         LEFT JOIN study_room_member_roles rr ON rr.room_id = m.room_id AND rr.user_id = m.user_id
         WHERE m.room_id = $1 AND m.user_id = $2 AND r.is_active = TRUE`,
    [roomId, userId],
  );

  return roleRes.rows[0]?.role || null;
}

module.exports = {
  ROOM_ROLE,
  ROOM_PERMISSION,
  ROOM_ROLE_PERMISSIONS,
  getRoomPermissions,
  getRoomRole,
  hasRoomPermission,
  roomRoleRank,
};
