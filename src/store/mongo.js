'use strict';

// ---------- MongoDB 存储后端（Vercel / 云部署用）----------
// 与 SQLite 后端提供完全一致的接口。集合：comments / like_marks / reports / settings
// 通过环境变量启用：DB_TYPE=mongo & MONGODB_URI=mongodb+srv://... & MONGODB_DB=kcomment

const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('使用 Mongo 后端必须配置 MONGODB_URI');
const dbName = process.env.MONGODB_DB || 'kcomment';

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
let readyPromise = null;

function collections() {
  const db = client.db(dbName);
  return {
    comments: db.collection('comments'),
    marks: db.collection('like_marks'),
    reports: db.collection('reports'),
    settings: db.collection('settings'),
  };
}

async function ensureIndexes() {
  const c = collections();
  await Promise.all([
    c.comments.createIndex({ page_key: 1, status: 1, id: 1 }),
    c.comments.createIndex({ parent_id: 1 }),
    c.comments.createIndex({ id: 1 }, { unique: true }),
    c.marks.createIndex({ comment_id: 1, token: 1 }, { unique: true }),
    c.reports.createIndex({ comment_id: 1 }),
    c.settings.createIndex({ key: 1 }, { unique: true }),
  ]);
}

async function connectOnce() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await client.connect();
      await ensureIndexes();
      // 迁移自增 id：用计数器模拟 AUTOINCREMENT 语义（对外 id 恒为整数）
      try {
        const max = await collections().comments.find({}, { sort: { id: -1 }, limit: 1 }).next();
        if (max) {
          await client.db(dbName).collection('counters').updateOne(
            { _id: 'comment_id' },
            { $set: { seq: max.id } },
            { upsert: true }
          );
        }
      } catch (e) { /* 计数器可缺省 */ }
    })();
  }
  return readyPromise;
}

async function nextId() {
  const r = await client.db(dbName).collection('counters').findOneAndUpdate(
    { _id: 'comment_id' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return r.seq || 1;
}

function serializeId(doc) {
  if (!doc) return null;
  // 统一暴露为 sqlite 同款字段结构，ObjectId 内部使用即可
  doc.id = Number(doc.id);
  delete doc._id;
  doc.is_anonymous = !!doc.is_anonymous;
  return doc;
}

module.exports = {
  kind: 'mongo',
  async commentCount() { await connectOnce(); return collections().comments.countDocuments(); },

  async listApproved(pageKey) {
    await connectOnce();
    const rows = await collections().comments
      .find({ page_key: pageKey, status: 'approved' }, { sort: { id: 1 } }).toArray();
    return rows.map(serializeId);
  },

  async insertComment(c) {
    await connectOnce();
    const id = await nextId();
    await collections().comments.insertOne({
      ...c,
      id,
      is_anonymous: c.is_anonymous ? 1 : 0,
      likes: 0,
      parent_id: c.parent_id || null,
      user_email_hash: c.user_email_hash || null,
    });
    return id;
  },

  async getComment(id) {
    await connectOnce();
    const doc = await collections().comments.findOne({ id: Number(id) });
    return serializeId(doc);
  },

  async setStatus(id, status) {
    await connectOnce();
    const r = await collections().comments.updateOne({ id: Number(id) }, { $set: { status } });
    return r.matchedCount > 0;
  },

  async deleteCascade(id) {
    await connectOnce();
    const c = collections();
    const target = await c.comments.findOne({ id: Number(id) });
    if (!target) return;
    await c.comments.deleteMany({ $or: [{ id: Number(id) }, { parent_id: Number(id) }] });
    await c.reports.deleteMany({ comment_id: Number(id) });
  },

  async likeState(commentId, token) {
    await connectOnce();
    const liked = await collections().marks.countDocuments({ comment_id: commentId, token }) > 0;
    const row = await collections().comments.findOne({ id: Number(commentId) }, { projection: { likes: 1 } });
    return { liked, likes: row ? row.likes : 0 };
  },
  async likeAdd(commentId, token, now) {
    await connectOnce();
    const r = await collections().marks.updateOne(
      { comment_id: commentId, token },
      { $setOnInsert: { created_at: now } },
      { upsert: true }
    );
    if (r.upsertedCount) {
      await collections().comments.updateOne({ id: Number(commentId) }, { $inc: { likes: 1 } });
      return { liked: true, likes: 0 };
    }
    const s = await this.likeState(commentId, token);
    return { liked: true, likes: s.likes };
  },
  async likeRemove(commentId, token) {
    await connectOnce();
    const r = await collections().marks.deleteOne({ comment_id: commentId, token });
    if (r.deletedCount) {
      await collections().comments.updateOne({ id: Number(commentId), likes: { $gt: 0 } }, { $inc: { likes: -1 } });
    }
    return this.likeState(commentId, token);
  },

  async insertReport(commentId, reason, ip, now) {
    await connectOnce();
    await collections().reports.insertOne({ comment_id: Number(commentId), reason, ip, created_at: now });
  },

  async adminList({ status, limit, offset }) {
    await connectOnce();
    const q = status ? { status } : {};
    const rows = await collections().comments.aggregate([
      { $match: q },
      {
        $lookup: {
          from: 'reports', localField: 'id', foreignField: 'comment_id', as: '_reports',
        },
      },
      { $addFields: { report_count: { $size: '$_reports' } } },
      { $project: { _reports: 0 } },
      { $sort: { id: -1 } },
      { $skip: offset },
      { $limit: limit },
    ]).toArray();
    const total = await collections().comments.countDocuments(q);
    return { rows: rows.map(serializeId), total };
  },

  async counts() {
    await connectOnce();
    const pending = await collections().comments.countDocuments({ status: 'pending' });
    const reportedDistinct = await collections().reports.distinct('comment_id');
    return { pending, reported: reportedDistinct.length };
  },

  async reportsLatest(limit) {
    await connectOnce();
    const reports = await collections().reports.find({}, { sort: { id: -1 } }).limit(limit).toArray();
    const ids = [...new Set(reports.map((r) => r.comment_id))];
    const comments = ids.length
      ? await collections().comments.find({ id: { $in: ids } }).toArray()
      : [];
    const cmap = new Map(comments.map((c) => [c.id, c]));
    return reports.flatMap((r) => {
      const c = cmap.get(r.comment_id);
      return c ? [{
        id: r._id ? String(r._id) : undefined,
        reason: r.reason, ip: r.ip, created_at: r.created_at,
        comment_id: c.id, content: c.content, user_name: c.user_name, status: c.status,
      }] : [];
    });
  },

  async demoInserts(rows) {
    await connectOnce();
    let seq = 0;
    for (const r of rows) {
      seq += 1;
      await collections().comments.insertOne({ ...r, id: await nextId(), is_anonymous: r.is_anonymous ? 1 : 0, likes: 0, parent_id: r.parent_id || null });
    }
  },

  async settingGet(key) {
    await connectOnce();
    const row = await collections().settings.findOne({ key });
    return row ? row.value : null;
  },
  async settingSet(key, value) {
    await connectOnce();
    await collections().settings.updateOne(
      { key },
      { $set: { value: String(value), updated_at: new Date().toISOString() } },
      { upsert: true }
    );
  },
};
