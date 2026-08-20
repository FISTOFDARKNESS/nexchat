import { NextResponse } from 'next/server';
import {
  sql, getAuthUser, sanitizeContent, isBlocked, areFriends, isGroupMember,
  triggerToUser, triggerToUsers, ONLINE_EXPR, purgeMatchFoundEvents
} from '@/lib/realtime';
import {
  enqueueMatchmaking, leaveMatchmakingQueue, getRandomRoom, getRandomRoomForUser,
  closeRandomRoom, markRoomReady, getCall, createCall, addCallParticipant, removeCallParticipant, endCall
} from '@/lib/realtime-state';
import { setUserOnline, broadcastPresence } from '@/lib/presence';
import { sendPushNotificationToUser } from '@/lib/push';
import { grantRandomVoice } from '@/lib/randomVoiceGrants';
import {
  ensureLevelsSchema, awardExpForMessage, bumpStreak, bumpNoReply, resetNoReply, requiresCaptcha, getLevelStats,
  EXP_MESSAGE_STRANGER,
} from '@/lib/levels';

const rateBuckets = new Map();
function rateLimited(userId, max = 20, window = 10000) {
  const now = Date.now();
  const b = rateBuckets.get(userId);
  if (!b || now - b.window > window) {
    rateBuckets.set(userId, { count: 1, window: now });
    return false;
  }
  b.count += 1;
  return b.count > max;
}

function parseFriendRoom(roomId, userId) {
  if (typeof roomId !== 'string') return null;
  const m = roomId.match(/^friend_chat_(.+)_(.+)_?$/);
  if (!m) return null;
  const a = m[1], b = m[2];
  if (a === userId) return b;
  if (b === userId) return a;
  return null; 
}

async function loadMatchProfile(userId) {
  try {
    const rows = await sql(
      `SELECT id, username, gender, country, bio, level,
              ("premiumTier" = 'premium' AND "premiumExpiresAt" > now()) as "isPremium",
              verified FROM "User" WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const u = rows[0];
    if (!u) return null;
    return {
      userId: u.id,
      username: u.username || 'Usuário',
      gender: u.gender || 'other',
      country: u.country || 'BR',
      bio: u.bio || '',
      level: Number(u.level) || 1,
      isPremium: !!u.isPremium,
      verified: !!u.verified
    };
  } catch {
    return null;
  }
}

async function groupMemberIds(groupId, exclude) {
  try {
    const rows = await sql('SELECT "userId" FROM "GroupMember" WHERE "groupId" = $1', [groupId]);
    return rows.map(r => r.userId).filter(id => id !== exclude);
  } catch {
    return [];
  }
}

export async function POST(req) {
  try {
    const auth = getAuthUser(req);
    if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const userId = auth.id;

    const body = await req.json().catch(() => ({}));
    const { event, payload } = body || {};
    if (!event) return NextResponse.json({ error: 'event ausente' }, { status: 400 });

    switch (event) {

      case 'session_init': {
        
        await purgeMatchFoundEvents(userId);
        const staleRoom = await getRandomRoomForUser(userId);
        if (staleRoom) {
          const ageMs = Date.now() - new Date(staleRoom.createdAt).getTime();
          if (ageMs >= 180_000) {
            
            await closeRandomRoom(staleRoom.roomId);
          }
        }
        await leaveMatchmakingQueue(userId);
        return NextResponse.json({ ok: true });
      }

      case 'identify': {
        if (payload?.userId && payload.userId !== userId) {
          return NextResponse.json({ error: 'userId inválido' }, { status: 403 });
        }
        await purgeMatchFoundEvents(userId);
        await setUserOnline(userId, true);
        await broadcastPresence(userId, true);
        return NextResponse.json({ success: true });
      }

      case 'join_queue': {
        const ud = payload || {};
        if (ud.userId !== userId) return NextResponse.json({ error: 'userId inválido' }, { status: 403 });
        
        const existing = await getRandomRoomForUser(userId);
        if (existing) {
          const ageMs = Date.now() - new Date(existing.createdAt).getTime();
          if (ageMs < 180_000) {
            const isA = existing.peerA === userId;
            let partner = {};
            try {
              const raw = isA ? existing.peerBData : existing.peerAData;
              partner = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
            } catch { partner = {}; }
            return NextResponse.json({
              success: true, status: 'matched',
              roomId: existing.roomId, role: isA ? 'caller' : 'receiver', partner
            });
          }
          
          const oldRoom = await closeRandomRoom(existing.roomId);
          if (oldRoom) {
            const other = oldRoom.peerA === userId ? oldRoom.peerB : null;
            if (other) await triggerToUser(other, 'peer_left', {});
          }
        }
        const profile = await loadMatchProfile(userId);
        if (!profile) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        
        if ((ud.mode || 'text') === 'video' && profile.level < 5) {
          return NextResponse.json({ error: 'Vídeo liberado a partir do nível 5', errorKey: 'videoLocked' }, { status: 403 });
        }
        const participant = {
          userId,
          username: profile.username,
          gender: ud.gender || profile.gender,
          country: ud.country || profile.country,
          bio: profile.bio,
          isPremium: profile.isPremium,
          verified: profile.verified,
          level: profile.level,
          prefGender: ud.prefGender || 'any',
          prefCountry: ud.prefCountry || 'any',
          prefMinLevel: Number(ud.prefMinLevel) || 1,
          prefMaxLevel: Number(ud.prefMaxLevel) || 100,
          mode: ud.mode || 'text'
        };
        const result = await enqueueMatchmaking(participant);
        if (result.status === 'matched' && result.room) {
          
          const room = result.room;
          const isCaller = room.peerA === userId;
          const myData = isCaller ? room.peerAData : room.peerBData;
          const partnerData = isCaller ? room.peerBData : room.peerAData;
          const partnerId = isCaller ? room.peerB : room.peerA;
          await triggerToUser(userId, 'match_found', { roomId: room.roomId, role: isCaller ? 'caller' : 'receiver', partner: partnerData });
          await triggerToUser(partnerId, 'match_found', { roomId: room.roomId, role: isCaller ? 'receiver' : 'caller', partner: myData });
          return NextResponse.json({ success: true, status: 'matched' });
        }
        return NextResponse.json({ success: true, status: 'waiting' });
      }

      case 'leave_queue': {
        await leaveMatchmakingQueue(userId);
        return NextResponse.json({ success: true });
      }

      case 'ready_for_room': {
        const { roomId } = payload || {};
        if (!roomId) return NextResponse.json({ error: 'roomId ausente' }, { status: 400 });
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ ok: true }); 
        if (room.peerA !== userId && room.peerB !== userId) {
          return NextResponse.json({ error: 'fora da sala' }, { status: 403 });
        }
        await markRoomReady(roomId, userId);
        return NextResponse.json({ ok: true });
      }

      case 'queue_status': {
        const room = await getRandomRoomForUser(userId);
        if (!room) return NextResponse.json({ success: true, status: 'waiting' });
        const isA = room.peerA === userId;
        let partner = {};
        try {
          const raw = isA ? room.peerBData : room.peerAData;
          partner = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch { partner = {}; }
        return NextResponse.json({
          success: true, status: 'matched',
          roomId: room.roomId, role: isA ? 'caller' : 'receiver', partner
        });
      }

      case 'leave_random_chat': {
        const { roomId } = payload || {};
        if (!roomId) return NextResponse.json({ error: 'roomId ausente' }, { status: 400 });
        
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ error: 'sala inexistente' }, { status: 404 });
        if (room.peerA !== userId && room.peerB !== userId) {
          return NextResponse.json({ error: 'fora da sala' }, { status: 403 });
        }
        
        await closeRandomRoom(roomId);
        return NextResponse.json({ success: true });
      }

      case 'send_random_msg': {
        if (rateLimited(userId)) { await triggerToUser(userId, 'rate_limited', {}); return NextResponse.json({ ok: true }); }
        const { roomId, message } = payload || {};
        if (!roomId || !message || typeof message.content !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 });
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ error: 'sala inexistente' }, { status: 404 });
        const other = room.peerA === userId ? room.peerB : (room.peerB === userId ? room.peerA : null);
        if (!other) return NextResponse.json({ error: 'fora da sala' }, { status: 403 });
        if (message.senderId !== userId) return NextResponse.json({ error: 'forgery' }, { status: 403 });

        if (message.type === 'voice') {
          if (!message.attachmentId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
          const clean = sanitizeContent(message.content || '');
          
          grantRandomVoice(message.attachmentId, userId, other);
          await triggerToUser(other, 'receive_random_msg', { ...message, senderId: userId, content: clean || '' });
          await ensureLevelsSchema();
          await awardExpForMessage(userId, other, '[voz]', EXP_MESSAGE_STRANGER, { friend: false });
          await bumpStreak(userId);
          await bumpNoReply(userId, other);
          await resetNoReply(other, userId);
          return NextResponse.json({ ok: true });
        }

        if (message.content.length > 5000) return NextResponse.json({ error: 'too long' }, { status: 413 });
        
        if (await requiresCaptcha(userId, other)) {
          await triggerToUser(userId, 'captcha_required', { peerId: other });
          return NextResponse.json({ ok: true });
        }
        const clean = sanitizeContent(message.content);
        if (!clean) return NextResponse.json({ ok: true });
        await triggerToUser(other, 'receive_random_msg', { ...message, senderId: userId, content: clean });
        await ensureLevelsSchema();
        await awardExpForMessage(userId, other, clean, EXP_MESSAGE_STRANGER, { friend: false });
        await bumpStreak(userId);
        await bumpNoReply(userId, other);
        await resetNoReply(other, userId);
        return NextResponse.json({ ok: true });
      }

      case 'like_random_msg': {
        const { roomId, messageId, likedByUserId } = payload || {};
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ ok: true });
        const other = room.peerA === userId ? room.peerB : (room.peerB === userId ? room.peerA : null);
        if (other) await triggerToUser(other, 'receive_random_msg_like', { messageId, likedByUserId });
        return NextResponse.json({ ok: true });
      }

      case 'react_random_msg': {
        const { roomId, messageId, emoji, username } = payload || {};
        if (typeof emoji !== 'string' || emoji.length > 32) return NextResponse.json({ ok: true });
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ ok: true });
        const other = room.peerA === userId ? room.peerB : (room.peerB === userId ? room.peerA : null);
        if (other) await triggerToUser(other, 'random_msg_reacted', { messageId, emoji, userId, username: username || '' });
        return NextResponse.json({ ok: true });
      }

      case 'unreact_random_msg': {
        const { roomId, messageId, emoji } = payload || {};
        if (typeof emoji !== 'string' || emoji.length > 32) return NextResponse.json({ ok: true });
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ ok: true });
        const other = room.peerA === userId ? room.peerB : (room.peerB === userId ? room.peerA : null);
        if (other) await triggerToUser(other, 'random_msg_unreacted', { messageId, emoji, userId });
        return NextResponse.json({ ok: true });
      }

      case 'send_random_friend_request': {
        if (rateLimited(userId)) return NextResponse.json({ ok: true });
        const { roomId, senderId } = payload || {};
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ ok: true });
        const other = room.peerA === userId ? room.peerB : (room.peerB === userId ? room.peerA : null);
        if (other) await triggerToUser(other, 'receive_random_friend_request', { senderId: userId });
        return NextResponse.json({ ok: true });
      }

      case 'accept_random_friend_request': {
        if (rateLimited(userId)) return NextResponse.json({ ok: true });
        const { roomId, senderId } = payload || {};
        const room = await getRandomRoom(roomId);
        if (!room) return NextResponse.json({ ok: true });
        const other = room.peerA === userId ? room.peerB : (room.peerB === userId ? room.peerA : null);
        if (other) await triggerToUser(other, 'receive_random_friend_accepted', { senderId: userId });
        return NextResponse.json({ ok: true });
      }

      case 'webrtc_offer': {
        const { roomId, from, to, offer } = payload || {};
        if (!roomId || !from || !to || !offer || from !== userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
        await triggerToUser(to, 'webrtc_offer', { roomId, from, to, offer });
        return NextResponse.json({ ok: true });
      }
      case 'webrtc_answer': {
        const { roomId, from, to, answer } = payload || {};
        if (!roomId || !from || !to || !answer || from !== userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
        await triggerToUser(to, 'webrtc_answer', { roomId, from, to, answer });
        return NextResponse.json({ ok: true });
      }
      case 'webrtc_ice_candidate': {
        const { roomId, from, to, candidate } = payload || {};
        if (!roomId || !from || !to || from !== userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
        await triggerToUser(to, 'webrtc_ice_candidate', { roomId, from, to, candidate });
        return NextResponse.json({ ok: true });
      }

      case 'join_friend_chat': {
        const { roomId } = payload || {};
        const other = parseFriendRoom(roomId, userId);
        if (!other) return NextResponse.json({ error: 'sala inválida' }, { status: 403 });
        const ok = await areFriends(userId, other);
        return NextResponse.json({ ok });
      }
      case 'leave_friend_chat':
        return NextResponse.json({ ok: true });

      case 'send_friend_msg': {
        if (rateLimited(userId)) { await triggerToUser(userId, 'rate_limited', {}); return NextResponse.json({ ok: true }); }
        const { roomId, message } = payload || {};
        const other = parseFriendRoom(roomId, userId);
        if (!other) return NextResponse.json({ error: 'sala inválida' }, { status: 403 });
        if (!message || typeof message.content !== 'string' || message.senderId !== userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
        if (message.content.length > 5000) return NextResponse.json({ error: 'too long' }, { status: 413 });
        if (!(await areFriends(userId, other))) return NextResponse.json({ error: 'não são amigos' }, { status: 403 });
        if (await isBlocked(userId, other)) return NextResponse.json({ ok: true });
        const clean = sanitizeContent(message.content);
        if (!clean) return NextResponse.json({ ok: true });
        const relayed = { ...message, senderId: userId, receiverId: other, content: clean };
        await triggerToUser(other, 'receive_friend_msg', relayed);
        return NextResponse.json({ ok: true });
      }

      case 'delete_friend_msg': {
        const { friendId, messageId } = payload || {};
        if (friendId) await triggerToUser(friendId, 'friend_msg_deleted', { messageId });
        return NextResponse.json({ ok: true });
      }
      case 'edit_friend_msg': {
        const { friendId, message } = payload || {};
        if (!message || !message.id || typeof message.content !== 'string') return NextResponse.json({ ok: true });
        if (message.content.length > 5000) return NextResponse.json({ ok: true });
        const clean = sanitizeContent(message.content);
        if (!clean) return NextResponse.json({ ok: true });
        const relayed = { ...message, senderId: userId, content: clean };
        if (friendId) await triggerToUser(friendId, 'friend_msg_edited', relayed);
        return NextResponse.json({ ok: true });
      }
      case 'friend_typing': {
        const { roomId, isTyping } = payload || {};
        const other = parseFriendRoom(roomId, userId);
        if (other) await triggerToUser(other, 'friend_typing', { senderId: userId, isTyping: !!isTyping });
        return NextResponse.json({ ok: true });
      }
      case 'friend_msgs_read': {
        const { friendId } = payload || {};
        if (friendId) await triggerToUser(friendId, 'friend_msgs_read', { readerId: userId });
        return NextResponse.json({ ok: true });
      }
      case 'like_friend_msg': {
        const { friendId, messageId, likedByUserId } = payload || {};
        if (friendId) await triggerToUser(friendId, 'receive_friend_msg_like', { messageId, likedByUserId });
        return NextResponse.json({ ok: true });
      }
      case 'react_friend_msg': {
        const { friendId, messageId, emoji, username } = payload || {};
        if (typeof emoji !== 'string' || emoji.length > 32) return NextResponse.json({ ok: true });
        if (friendId) await triggerToUser(friendId, 'friend_msg_reacted', { messageId, emoji, userId, username: username || '' });
        return NextResponse.json({ ok: true });
      }
      case 'unreact_friend_msg': {
        const { friendId, messageId, emoji } = payload || {};
        if (typeof emoji !== 'string' || emoji.length > 32) return NextResponse.json({ ok: true });
        if (friendId) await triggerToUser(friendId, 'friend_msg_unreacted', { messageId, emoji, userId });
        return NextResponse.json({ ok: true });
      }
      case 'view_once_viewed': {
        
        const { messageId, senderId } = payload || {};
        if (messageId && senderId) await triggerToUser(senderId, 'view_once_viewed', { messageId });
        return NextResponse.json({ ok: true });
      }

      case 'join_group_chat': {
        const { groupId } = payload || {};
        const ok = await isGroupMember(groupId, userId);
        return NextResponse.json({ ok });
      }
      case 'leave_group_chat':
        return NextResponse.json({ ok: true });

      case 'send_group_msg': {
        if (rateLimited(userId)) { await triggerToUser(userId, 'rate_limited', {}); return NextResponse.json({ ok: true }); }
        const { groupId, message } = payload || {};
        if (!groupId || !message || typeof message.content !== 'string' || message.senderId !== userId) {
          return NextResponse.json({ error: 'invalid' }, { status: 400 });
        }
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ error: 'não é membro' }, { status: 403 });
        if (message.content.length > 5000) return NextResponse.json({ error: 'too long' }, { status: 413 });
        const clean = sanitizeContent(message.content);
        if (!clean) return NextResponse.json({ ok: true });
        const relayed = { ...message, senderId: userId, content: clean };
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'receive_group_msg', relayed);
        return NextResponse.json({ ok: true });
      }
      case 'react_group_msg': {
        const { groupId, messageId, emoji, username } = payload || {};
        if (typeof emoji !== 'string' || emoji.length > 32) return NextResponse.json({ ok: true });
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ ok: true });
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'group_msg_reacted', { messageId, emoji, userId, username: username || '' });
        return NextResponse.json({ ok: true });
      }
      case 'unreact_group_msg': {
        const { groupId, messageId, emoji } = payload || {};
        if (typeof emoji !== 'string' || emoji.length > 32) return NextResponse.json({ ok: true });
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ ok: true });
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'group_msg_unreacted', { messageId, emoji, userId });
        return NextResponse.json({ ok: true });
      }
      case 'like_group_msg': {
        const { groupId, messageId, likedByUserId } = payload || {};
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ ok: true });
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'receive_group_msg_like', { messageId, likedByUserId });
        return NextResponse.json({ ok: true });
      }
      case 'pin_group_msg': {
        const { groupId, messageId, pinnedAt } = payload || {};
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ ok: true });
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'group_msg_pinned', { messageId, pinnedAt: pinnedAt || new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case 'unpin_group_msg': {
        const { groupId, messageId } = payload || {};
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ ok: true });
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'group_msg_unpinned', { messageId });
        return NextResponse.json({ ok: true });
      }
      case 'group_msgs_read': {
        const { groupId, messageIds, readAt } = payload || {};
        if (!Array.isArray(messageIds) || messageIds.length === 0) return NextResponse.json({ ok: true });
        if (!(await isGroupMember(groupId, userId))) return NextResponse.json({ ok: true });
        const members = await groupMemberIds(groupId, userId);
        await triggerToUsers(members, 'group_msg_read_by', { userId, messageIds, readAt: readAt || new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }

      case 'call_friend': {
        const { friendUserId, callerData, type, callRoomId } = payload || {};
        if (!callRoomId || !friendUserId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
        
        if (type === 'video') {
          await ensureLevelsSchema();
          const lvlRows = await sql('SELECT level FROM "User" WHERE id = $1 LIMIT 1', [userId]);
          if (!(lvlRows[0]?.level >= 5)) {
            await triggerToUser(userId, `call_rejected_for_${callRoomId}`, {});
            return NextResponse.json({ error: 'Vídeo liberado a partir do nível 5', errorKey: 'videoLocked' }, { status: 403 });
          }
        }
        if (await isBlocked(userId, friendUserId)) {
          await triggerToUser(userId, `call_rejected_for_${callRoomId}`, {});
          return NextResponse.json({ ok: true });
        }
        await createCall(callRoomId, type, userId, [userId, friendUserId]);
        await triggerToUser(friendUserId, `incoming_call_to_${friendUserId}`, {
          callerData, callerId: callerData?.id, type, callRoomId, isGroup: false
        });
        
        const rows = await sql(`SELECT ${ONLINE_EXPR} as "isOnline" FROM "User" WHERE id = $1 LIMIT 1`, [friendUserId]);
        if (!rows[0]?.isOnline) {
          await sendPushNotificationToUser(friendUserId, {
            title: `Chamada de ${callerData?.username || 'Alguém'}`,
            body: type === 'video' ? 'Você recebeu uma chamada de vídeo' : 'Você recebeu uma chamada de áudio',
            icon: callerData?.avatarUrl || '/icon.svg',
            badge: '/icon.svg',
            tag: `call-${callRoomId}`,
            data: { url: '/', targetId: userId, callRoomId, isNewSession: true }
          });
        }
        return NextResponse.json({ ok: true });
      }
      case 'add_friend_to_call': {
        const { callRoomId, friendUserId, callerData, type } = payload || {};
        const call = await getCall(callRoomId);
        if (!call) return NextResponse.json({ ok: true });
        if (!call.participants.includes(userId)) return NextResponse.json({ ok: true });
        if (call.participants.includes(friendUserId)) return NextResponse.json({ ok: true });
        if (await isBlocked(userId, friendUserId)) return NextResponse.json({ ok: true });
        await addCallParticipant(callRoomId, friendUserId);
        await triggerToUser(friendUserId, `incoming_call_to_${friendUserId}`, {
          callerData, callerId: userId, type, callRoomId, isGroup: true
        });
        const rows = await sql(`SELECT ${ONLINE_EXPR} as "isOnline" FROM "User" WHERE id = $1 LIMIT 1`, [friendUserId]);
        if (!rows[0]?.isOnline) {
          await sendPushNotificationToUser(friendUserId, {
            title: `Chamada de ${callerData?.username || 'Alguém'}`,
            body: 'Você foi adicionado a uma chamada em grupo',
            icon: callerData?.avatarUrl || '/icon.svg',
            badge: '/icon.svg',
            tag: `call-${callRoomId}`,
            data: { url: '/', targetId: userId, callRoomId, isNewSession: true }
          });
        }
        return NextResponse.json({ ok: true });
      }
      case 'accept_friend_call': {
        const { callRoomId } = payload || {};
        const call = await getCall(callRoomId);
        if (!call || !call.participants.includes(userId)) return NextResponse.json({ ok: true });
        await addCallParticipant(callRoomId, userId);
        const others = call.participants.filter(p => p !== userId);
        await triggerToUsers(others, `call_accepted_for_${callRoomId}`, {});
        await triggerToUsers(others, 'participant_joined', { userId });
        await triggerToUser(userId, 'call_participants', { participants: call.participants, type: call.type });
        return NextResponse.json({ ok: true });
      }
      case 'reject_friend_call': {
        const { callRoomId } = payload || {};
        const call = await getCall(callRoomId);
        if (!call || !call.participants.includes(userId)) return NextResponse.json({ ok: true });
        await triggerToUsers(call.participants.filter(p => p !== userId), `call_rejected_for_${callRoomId}`, {});
        await removeCallParticipant(callRoomId, userId);
        return NextResponse.json({ ok: true });
      }
      case 'end_friend_call': {
        const { callRoomId } = payload || {};
        const call = await getCall(callRoomId);
        if (!call) return NextResponse.json({ ok: true });
        if (!call.participants.includes(userId)) return NextResponse.json({ ok: true });
        await triggerToUsers(call.participants.filter(p => p !== userId), 'friend_call_ended', {});
        await endCall(callRoomId);
        return NextResponse.json({ ok: true });
      }
      case 'friend_call_logged': {
        const { roomId, message } = payload || {};
        if (!roomId || !message) return NextResponse.json({ ok: true });
        if (message.receiverId) await triggerToUser(message.receiverId, 'friend_call_logged', message);
        return NextResponse.json({ ok: true });
      }

      case 'match_found':
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json({ error: 'event desconhecido' }, { status: 400 });
    }
  } catch (e) {
    console.error('[realtime] erro geral:', e.message);
    return NextResponse.json({ error: 'Erro interno: ' + (e && e.message ? e.message : e) }, { status: 500 });
  }
}
