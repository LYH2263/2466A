import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const BACKUP_VERSION = '1.0.0';
const BACKUP_MAGIC = 'ASSET-BACKUP';
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;
const CHECKSUM_SECRET = process.env.BACKUP_CHECKSUM_SECRET || 'asset-backup-secret';

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供访问令牌' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: '访问令牌无效或已过期' });
  }
}

function computeChecksum(data: any): string {
  const payload = JSON.stringify(data);
  return crypto
    .createHmac('sha256', CHECKSUM_SECRET)
    .update(payload)
    .digest('hex');
}

function serializeDecimalToString(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'object' && 'toNumber' in obj && typeof obj.toNumber === 'function') {
    return obj.toNumber();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeDecimalToString);
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeDecimalToString(value);
    }
    return result;
  }
  return obj;
}

function dateToISOString(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString();
}

async function collectUserData(userId: string) {
  const categories = await prisma.category.findMany({ where: { userId } });
  const tags = await prisma.tag.findMany({ where: { userId } });
  const assetRecords = await prisma.assetRecord.findMany({ where: { userId } });
  const assetItems = await prisma.assetItem.findMany({
    where: { assetRecord: { userId } }
  });
  const assetRecordTags = await prisma.assetRecordTag.findMany({
    where: { assetRecord: { userId } }
  });
  const liabilityRecords = await prisma.liabilityRecord.findMany({ where: { userId } });
  const goals = await prisma.goal.findMany({ where: { userId } });
  const targetAllocation = await prisma.targetAllocation.findUnique({ where: { userId } });
  const cashFlows = await prisma.cashFlow.findMany({ where: { userId } });

  const serializeCat = (c: any) => serializeDecimalToString({
    id: c.id,
    userId: c.userId,
    name: c.name,
    color: c.color,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    isDefault: c.isDefault,
    deletedAt: c.deletedAt ? dateToISOString(c.deletedAt) : null,
    createdAt: dateToISOString(c.createdAt),
    updatedAt: dateToISOString(c.updatedAt),
  });
  const serializeTag = (t: any) => serializeDecimalToString({
    id: t.id,
    userId: t.userId,
    name: t.name,
    color: t.color,
    createdAt: dateToISOString(t.createdAt),
    updatedAt: dateToISOString(t.updatedAt),
  });
  const serializeAssetRecord = (r: any) => serializeDecimalToString({
    id: r.id,
    userId: r.userId,
    date: dateToISOString(r.date),
    cash: r.cash,
    longTermInvest: r.longTermInvest,
    stableBond: r.stableBond,
    total: r.total,
    note: r.note,
    editCount: r.editCount,
    previousSnapshot: r.previousSnapshot,
    createdAt: dateToISOString(r.createdAt),
    updatedAt: dateToISOString(r.updatedAt),
  });
  const serializeAssetItem = (i: any) => serializeDecimalToString({
    id: i.id,
    assetRecordId: i.assetRecordId,
    categoryId: i.categoryId,
    amount: i.amount,
    createdAt: dateToISOString(i.createdAt),
  });
  const serializeAssetRecordTag = (l: any) => serializeDecimalToString({
    id: l.id,
    assetRecordId: l.assetRecordId,
    tagId: l.tagId,
    createdAt: dateToISOString(l.createdAt),
  });
  const serializeLiabilityRecord = (r: any) => serializeDecimalToString({
    id: r.id,
    userId: r.userId,
    name: r.name,
    amount: r.amount,
    date: dateToISOString(r.date),
    note: r.note,
    createdAt: dateToISOString(r.createdAt),
    updatedAt: dateToISOString(r.updatedAt),
  });
  const serializeGoal = (g: any) => serializeDecimalToString({
    id: g.id,
    userId: g.userId,
    name: g.name,
    targetAmount: g.targetAmount,
    targetDate: dateToISOString(g.targetDate),
    scope: g.scope,
    categoryId: g.categoryId,
    isCompleted: g.isCompleted,
    createdAt: dateToISOString(g.createdAt),
    updatedAt: dateToISOString(g.updatedAt),
  });
  const serializeCashFlow = (cf: any) => serializeDecimalToString({
    id: cf.id,
    userId: cf.userId,
    assetRecordId: cf.assetRecordId,
    date: dateToISOString(cf.date),
    amount: cf.amount,
    type: cf.type,
    note: cf.note,
    createdAt: dateToISOString(cf.createdAt),
    updatedAt: dateToISOString(cf.updatedAt),
  });

  const data = {
    categories: categories.map(serializeCat),
    tags: tags.map(serializeTag),
    assetRecords: assetRecords.map(serializeAssetRecord),
    assetItems: assetItems.map(serializeAssetItem),
    assetRecordTags: assetRecordTags.map(serializeAssetRecordTag),
    liabilityRecords: liabilityRecords.map(serializeLiabilityRecord),
    goals: goals.map(serializeGoal),
    targetAllocation: targetAllocation ? serializeDecimalToString({
      id: targetAllocation.id,
      userId: targetAllocation.userId,
      allocations: targetAllocation.allocations,
      warningThreshold: targetAllocation.warningThreshold,
      createdAt: dateToISOString(targetAllocation.createdAt),
      updatedAt: dateToISOString(targetAllocation.updatedAt),
    }) : null,
    cashFlows: cashFlows.map(serializeCashFlow),
  };

  const stats = {
    categories: data.categories.length,
    tags: data.tags.length,
    assetRecords: data.assetRecords.length,
    assetItems: data.assetItems.length,
    assetRecordTags: data.assetRecordTags.length,
    liabilityRecords: data.liabilityRecords.length,
    goals: data.goals.length,
    targetAllocation: data.targetAllocation ? 1 : 0,
    cashFlows: data.cashFlows.length,
  };

  return { data, stats };
}

router.get('/export', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const { data, stats } = await collectUserData(userId);

    const checksum = computeChecksum({
      version: BACKUP_VERSION,
      userId,
      exportedAt: new Date().toISOString(),
      data,
    });

    const backup = {
      magic: BACKUP_MAGIC,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        userId: user.id,
        userEmail: user.email,
      },
      checksum,
      stats,
      data,
    };

    const filename = `asset-backup-${user.email.split('@')[0]}-${Date.now()}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(backup);
  } catch (error) {
    console.error('Export backup error:', error);
    res.status(500).json({ error: '导出备份失败' });
  }
});

const backupHeaderSchema = z.object({
  magic: z.literal(BACKUP_MAGIC),
  version: z.string(),
  exportedAt: z.string().datetime(),
  exportedBy: z.object({
    userId: z.string(),
    userEmail: z.string().email(),
  }),
  checksum: z.string(),
  stats: z.object({
    categories: z.number().int().nonnegative(),
    tags: z.number().int().nonnegative(),
    assetRecords: z.number().int().nonnegative(),
    assetItems: z.number().int().nonnegative(),
    assetRecordTags: z.number().int().nonnegative(),
    liabilityRecords: z.number().int().nonnegative(),
    goals: z.number().int().nonnegative(),
    targetAllocation: z.number().int().min(0).max(1),
    cashFlows: z.number().int().nonnegative(),
  }),
  data: z.record(z.any()),
});

function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const parts = v.split('.').map(n => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [major, minor, patch] = parts;
  return { major, minor, patch };
}

function isVersionCompatible(backupVersion: string): { compatible: boolean; reason?: string } {
  const backup = parseVersion(backupVersion);
  const current = parseVersion(BACKUP_VERSION);
  if (!backup || !current) {
    return { compatible: false, reason: '版本号格式无效' };
  }
  if (backup.major !== current.major) {
    return { compatible: false, reason: `主版本不兼容：备份v${backupVersion} vs 当前v${BACKUP_VERSION}` };
  }
  if (backup.minor > current.minor) {
    return { compatible: false, reason: `备份版本较新，请升级系统：备份v${backupVersion} vs 当前v${BACKUP_VERSION}` };
  }
  return { compatible: true };
}

const importValidateSchema = z.object({
  strategy: z.enum(['merge', 'overwrite']),
});

async function getCurrentCounts(userId: string) {
  const categories = await prisma.category.findMany({ where: { userId }, select: { id: true, name: true, deletedAt: true } });
  const tags = await prisma.tag.findMany({ where: { userId }, select: { id: true, name: true } });
  const assetRecords = await prisma.assetRecord.findMany({ where: { userId }, select: { id: true, date: true } });
  const assetItems = await prisma.assetItem.findMany({ where: { assetRecord: { userId } }, select: { id: true, assetRecordId: true, categoryId: true } });
  const assetRecordTags = await prisma.assetRecordTag.findMany({ where: { assetRecord: { userId } }, select: { id: true, assetRecordId: true, tagId: true } });
  const liabilityRecords = await prisma.liabilityRecord.findMany({ where: { userId }, select: { id: true, name: true, date: true } });
  const goals = await prisma.goal.findMany({ where: { userId }, select: { id: true, name: true } });
  const targetAllocation = await prisma.targetAllocation.findUnique({ where: { userId }, select: { id: true } });
  const cashFlows = await prisma.cashFlow.findMany({ where: { userId }, select: { id: true, assetRecordId: true, date: true, amount: true, type: true, note: true } });

  return {
    categories,
    tags,
    assetRecords,
    assetItems,
    assetRecordTags,
    liabilityRecords,
    goals,
    targetAllocation,
    cashFlows,
  };
}

interface DiffItem {
  total: number;
  toAdd: number;
  toUpdate: number;
  toDelete: number;
  conflicts: string[];
}

interface DiffResult {
  categories: DiffItem;
  tags: DiffItem;
  assetRecords: DiffItem;
  assetItems: DiffItem;
  assetRecordTags: DiffItem;
  liabilityRecords: DiffItem;
  goals: DiffItem;
  targetAllocation: DiffItem;
  cashFlows: DiffItem;
  warnings: string[];
}

function computeDiff(backup: any, current: any, strategy: 'merge' | 'overwrite'): DiffResult {
  const warnings: string[] = [];

  const currentCatByKey = new Map<string, any>(
    current.categories.map((c: any) => [c.name + '|' + (c.deletedAt ? 'deleted' : 'active'), c])
  );
  const currentCatById = new Map<string, any>(current.categories.map((c: any) => [c.id, c]));
  const currentTagsByName = new Map<string, any>(current.tags.map((t: any) => [t.name, t]));
  const currentTagsById = new Map<string, any>(current.tags.map((t: any) => [t.id, t]));
  const currentRecordsByDate = new Map<string, any>(
    current.assetRecords.map((r: any) => [new Date(r.date).toISOString().split('T')[0], r])
  );
  const currentRecordsById = new Map<string, any>(current.assetRecords.map((r: any) => [r.id, r]));
  const currentLiabByKey = new Map<string, any>(
    current.liabilityRecords.map((r: any) => {
      const dk = new Date(r.date).toISOString().split('T')[0];
      return [r.name + '|' + dk, r] as [string, any];
    })
  );
  const currentLiabById = new Map<string, any>(current.liabilityRecords.map((r: any) => [r.id, r]));
  const currentGoalsByName = new Map<string, any>(current.goals.map((g: any) => [g.name, g]));
  const currentGoalsById = new Map<string, any>(current.goals.map((g: any) => [g.id, g]));
  const currentCfByKey = new Map<string, any>(
    current.cashFlows.map((cf: any) => {
      const dk = new Date(cf.date).toISOString().split('T')[0];
      let key;
      if (cf.assetRecordId) {
        key = 'AR:' + cf.assetRecordId + '|' + dk + '|' + cf.type + '|' + String(cf.amount);
      } else {
        key = 'I:' + dk + '|' + cf.type + '|' + String(cf.amount) + '|' + (cf.note || '');
      }
      return [key, cf] as [string, any];
    })
  );
  const currentCfById = new Map<string, any>(current.cashFlows.map((cf: any) => [cf.id, cf]));

  function calcSimpleItem(
    backupList: any[],
    currentList: any[],
    currentIdMap: Map<string, any>,
    currentAltMap: Map<string, any>,
    altKeyFn: (item: any) => string,
    nameForConflict: (item: any) => string,
    conflictLabel: string,
    entityName: string
  ): DiffItem {
    let toAdd = 0;
    let toUpdate = 0;
    const conflicts: string[] = [];
    const processedBackupIds = new Set<string>();

    for (const item of backupList) {
      const altKey = altKeyFn(item);
      const existingByAlt = currentAltMap.get(altKey);
      const existingById = currentIdMap.get(item.id);

      if (strategy === 'overwrite') {
        if (existingById || existingByAlt) {
          toUpdate++;
        } else {
          toAdd++;
        }
      } else {
        if (existingById) {
          toUpdate++;
          if (existingByAlt && existingByAlt.id !== item.id) {
            conflicts.push(conflictLabel + ': ' + nameForConflict(item) + ' (ID冲突)');
          }
        } else if (existingByAlt) {
          conflicts.push(conflictLabel + ': ' + nameForConflict(item) + ' (' + entityName + '重复)');
          toUpdate++;
        } else {
          toAdd++;
        }
      }
      processedBackupIds.add(item.id);
    }

    const toDelete = strategy === 'overwrite'
      ? currentList.filter((c: any) => !processedBackupIds.has(c.id)).length
      : 0;

    return { total: backupList.length, toAdd, toUpdate, toDelete, conflicts };
  }

  const categoriesDiff = calcSimpleItem(
    backup.data.categories,
    current.categories,
    currentCatById,
    currentCatByKey,
    (c: any) => c.name + '|' + (c.deletedAt ? 'deleted' : 'active'),
    (c: any) => c.name,
    '类别',
    '类别名称+状态'
  );

  const tagsDiff = calcSimpleItem(
    backup.data.tags,
    current.tags,
    currentTagsById,
    currentTagsByName,
    (t: any) => t.name,
    (t: any) => t.name,
    '标签',
    '标签名称'
  );

  const recordsConflicts: string[] = [];
  for (const r of backup.data.assetRecords) {
    const dateKey = new Date(r.date).toISOString().split('T')[0];
    const existingByDate = currentRecordsByDate.get(dateKey);
    const existingById = currentRecordsById.get(r.id);
    if (strategy === 'merge') {
      if (existingByDate && existingByDate.id !== r.id) {
        const noteText = r.note ? '备注: ' + r.note : '无备注';
        recordsConflicts.push('资产记录日期 ' + dateKey + '：将合并/覆盖同日期记录（' + noteText + '）');
      }
    }
  }
  if (recordsConflicts.length > 0 && strategy === 'merge') {
    warnings.push('检测到 ' + recordsConflicts.length + ' 条同日期资产记录冲突，合并模式下将以备份数据覆盖现有同日期记录');
  }

  let recordsToAdd = 0;
  let recordsToUpdate = 0;
  for (const r of backup.data.assetRecords) {
    const dateKey = new Date(r.date).toISOString().split('T')[0];
    const hasByDate = currentRecordsByDate.has(dateKey);
    const hasById = currentRecordsById.has(r.id);
    if (!hasByDate && !hasById) {
      recordsToAdd++;
    } else {
      recordsToUpdate++;
    }
  }

  const assetRecordsDiff: DiffItem = {
    total: backup.data.assetRecords.length,
    toAdd: recordsToAdd,
    toUpdate: recordsToUpdate,
    toDelete: strategy === 'overwrite' ? current.assetRecords.length : 0,
    conflicts: recordsConflicts,
  };

  const assetItemsDiff: DiffItem = {
    total: backup.data.assetItems.length,
    toAdd: backup.data.assetItems.length,
    toUpdate: 0,
    toDelete: strategy === 'overwrite' ? current.assetItems.length : 0,
    conflicts: [],
  };

  const assetRecordTagsDiff: DiffItem = {
    total: backup.data.assetRecordTags.length,
    toAdd: backup.data.assetRecordTags.length,
    toUpdate: 0,
    toDelete: strategy === 'overwrite' ? current.assetRecordTags.length : 0,
    conflicts: [],
  };

  const liabilityRecordsDiff = calcSimpleItem(
    backup.data.liabilityRecords,
    current.liabilityRecords,
    currentLiabById,
    currentLiabByKey,
    (r: any) => r.name + '|' + new Date(r.date).toISOString().split('T')[0],
    (r: any) => r.name + ' (' + new Date(r.date).toISOString().split('T')[0] + ')',
    '负债记录',
    '名称+日期'
  );

  const goalsDiff = calcSimpleItem(
    backup.data.goals,
    current.goals,
    currentGoalsById,
    currentGoalsByName,
    (g: any) => g.name,
    (g: any) => g.name,
    '目标',
    '目标名称'
  );

  const taDiff: DiffItem = {
    total: backup.data.targetAllocation ? 1 : 0,
    toAdd: backup.data.targetAllocation && !current.targetAllocation ? 1 : 0,
    toUpdate: backup.data.targetAllocation && current.targetAllocation ? 1 : 0,
    toDelete: strategy === 'overwrite' && current.targetAllocation && !backup.data.targetAllocation ? 1 : 0,
    conflicts: [],
  };

  const backupDateToCurrentRecId: Record<string, string> = {};
  for (const r of backup.data.assetRecords) {
    const dateKey = new Date(r.date).toISOString().split('T')[0];
    const existing = currentRecordsByDate.get(dateKey);
    if (existing) {
      backupDateToCurrentRecId[r.id] = existing.id;
    }
  }

  let cfToAdd = 0;
  let cfToUpdate = 0;
  const cfConflicts: string[] = [];
  const processedCfIds = new Set<string>();
  for (const cf of backup.data.cashFlows) {
    const dk = new Date(cf.date).toISOString().split('T')[0];
    let bkKey;
    if (cf.assetRecordId) {
      const mappedArId = backupDateToCurrentRecId[cf.assetRecordId] || cf.assetRecordId;
      bkKey = 'AR:' + mappedArId + '|' + dk + '|' + cf.type + '|' + String(cf.amount);
    } else {
      bkKey = 'I:' + dk + '|' + cf.type + '|' + String(cf.amount) + '|' + (cf.note || '');
    }
    const existingByKey = currentCfByKey.get(bkKey);
    const existingById = currentCfById.get(cf.id);
    const noteText = cf.note || '无备注';
    const showKey = dk + ' ' + cf.type + ' ¥' + String(cf.amount) + '（' + noteText + '）';

    if (strategy === 'overwrite') {
      if (existingById || existingByKey) {
        cfToUpdate++;
      } else {
        cfToAdd++;
      }
    } else {
      if (existingByKey) {
        cfToUpdate++;
        if (existingByKey.id !== cf.id) {
          cfConflicts.push('资金流: ' + showKey + '（合并时将更新现有记录，避免重复叠加）');
        }
      } else if (existingById) {
        cfToUpdate++;
      } else {
        cfToAdd++;
      }
    }
    processedCfIds.add(cf.id);
  }
  const cashFlowsDiff: DiffItem = {
    total: backup.data.cashFlows.length,
    toAdd: cfToAdd,
    toUpdate: cfToUpdate,
    toDelete: strategy === 'overwrite'
      ? current.cashFlows.filter((c: any) => !processedCfIds.has(c.id)).length
      : 0,
    conflicts: cfConflicts,
  };

  if (strategy === 'overwrite') {
    warnings.push('覆盖模式将删除所有现有数据并替换为备份数据（刷新令牌等认证信息不受影响）');
  }

  const allConflicts: string[] = [];
  allConflicts.push(...categoriesDiff.conflicts);
  allConflicts.push(...tagsDiff.conflicts);
  allConflicts.push(...assetRecordsDiff.conflicts);
  allConflicts.push(...liabilityRecordsDiff.conflicts);
  allConflicts.push(...goalsDiff.conflicts);
  allConflicts.push(...cashFlowsDiff.conflicts);
  if (allConflicts.length > 5) {
    warnings.push('共有 ' + allConflicts.length + ' 处冲突，以上仅显示部分');
  }

  return {
    categories: categoriesDiff,
    tags: tagsDiff,
    assetRecords: assetRecordsDiff,
    assetItems: assetItemsDiff,
    assetRecordTags: assetRecordTagsDiff,
    liabilityRecords: liabilityRecordsDiff,
    goals: goalsDiff,
    targetAllocation: taDiff,
    cashFlows: cashFlowsDiff,
    warnings,
  };
}

router.post('/validate', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.userId;
    const rawBody = req.body;

    if (!rawBody || typeof rawBody !== 'object') {
      return res.status(400).json({ error: '无效的备份文件格式' });
    }

    const jsonSize = Buffer.byteLength(JSON.stringify(rawBody), 'utf8');
    if (jsonSize > MAX_BACKUP_SIZE) {
      const sizeMB = (jsonSize / 1024 / 1024).toFixed(2);
      const maxMB = MAX_BACKUP_SIZE / 1024 / 1024;
      return res.status(413).json({ error: '备份文件过大（' + sizeMB + 'MB），最大允许 ' + maxMB + 'MB' });
    }

    const headerResult = backupHeaderSchema.safeParse(rawBody);
    if (!headerResult.success) {
      const issues = headerResult.error.issues;
      const firstIssue = issues[0];
      let msg = '备份文件格式无效';
      if (firstIssue) {
        const path = firstIssue.path.join('.');
        msg = '备份文件字段 "' + path + '" 无效: ' + firstIssue.message;
      }
      if (rawBody.magic !== BACKUP_MAGIC) {
        msg = '无效的备份文件：缺少魔术标识或文件已损坏';
      }
      return res.status(400).json({ error: msg });
    }

    const backup = rawBody;

    const versionCheck = isVersionCompatible(backup.version);
    if (!versionCheck.compatible) {
      return res.status(400).json({
        error: '备份版本不兼容',
        versionError: versionCheck.reason,
        backupVersion: backup.version,
        currentVersion: BACKUP_VERSION,
      });
    }

    const expectedChecksum = computeChecksum({
      version: backup.version,
      userId: backup.exportedBy.userId,
      exportedAt: backup.exportedAt,
      data: backup.data,
    });

    let checksumValid = false;
    try {
      checksumValid = crypto.timingSafeEqual(
        Buffer.from(backup.checksum, 'hex'),
        Buffer.from(expectedChecksum, 'hex')
      );
    } catch {
      checksumValid = false;
    }

    const integrity = checksumValid ? 'valid' : 'tampered';
    const integrityWarnings: string[] = [];
    if (!checksumValid) {
      integrityWarnings.push('警告：备份文件校验和不匹配，文件可能被篡改或损坏，导入存在风险');
    }

    const { strategy } = importValidateSchema.parse(req.query || {});

    const current = await getCurrentCounts(userId);
    const diff = computeDiff(backup, current, strategy);

    res.json({
      valid: true,
      backup: {
        version: backup.version,
        exportedAt: backup.exportedAt,
        exportedBy: backup.exportedBy,
        stats: backup.stats,
      },
      integrity,
      integrityWarnings,
      diff,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Validate backup error:', error);
    res.status(500).json({ error: '校验备份文件失败' });
  }
});

const importSchema = z.object({
  strategy: z.enum(['merge', 'overwrite']),
  allowTampered: z.boolean().optional().default(false),
  backup: z.record(z.any()),
});

function regenerateIdsAndRemap(backupData: any, current: any, strategy: 'merge' | 'overwrite') {
  const idMap: Record<string, string> = {};
  const newId = () => crypto.randomUUID();

  const currentCatByName = new Map<string, any>(
    current.categories
      .filter((c: any) => !c.deletedAt)
      .map((c: any) => [c.name, c])
  );
  for (const cat of backupData.categories) {
    const existing = currentCatByName.get(cat.name);
    if (existing && strategy === 'merge' && !cat.deletedAt) {
      idMap[cat.id] = existing.id;
    } else {
      idMap[cat.id] = newId();
    }
  }

  const currentTagsByName = new Map<string, any>(current.tags.map((t: any) => [t.name, t]));
  for (const tag of backupData.tags) {
    const existing = currentTagsByName.get(tag.name);
    if (existing && strategy === 'merge') {
      idMap[tag.id] = existing.id;
    } else {
      idMap[tag.id] = newId();
    }
  }

  const currentRecordsByDate = new Map<string, any>(
    current.assetRecords.map((r: any) => [new Date(r.date).toISOString().split('T')[0], r])
  );
  for (const record of backupData.assetRecords) {
    const dateKey = new Date(record.date).toISOString().split('T')[0];
    const existing = currentRecordsByDate.get(dateKey);
    if (existing && strategy === 'merge') {
      idMap[record.id] = existing.id;
    } else {
      idMap[record.id] = newId();
    }
  }

  const currentLiabByKey = new Map<string, any>(
    current.liabilityRecords.map((r: any) => {
      const dk = new Date(r.date).toISOString().split('T')[0];
      return [r.name + '|' + dk, r];
    })
  );
  for (const r of backupData.liabilityRecords) {
    const dk = new Date(r.date).toISOString().split('T')[0];
    const key = r.name + '|' + dk;
    const existing = currentLiabByKey.get(key);
    if (existing && strategy === 'merge') {
      idMap[r.id] = existing.id;
    } else {
      idMap[r.id] = newId();
    }
  }

  const currentGoalsByName = new Map<string, any>(current.goals.map((g: any) => [g.name, g]));
  for (const goal of backupData.goals) {
    const existing = currentGoalsByName.get(goal.name);
    if (existing && strategy === 'merge') {
      idMap[goal.id] = existing.id;
    } else {
      idMap[goal.id] = newId();
    }
  }

  for (const item of backupData.assetItems) {
    idMap[item.id] = newId();
  }
  for (const link of backupData.assetRecordTags) {
    idMap[link.id] = newId();
  }

  const currentCfByKey = new Map<string, any>(
    current.cashFlows.map((cf: any) => {
      const dk = new Date(cf.date).toISOString().split('T')[0];
      let key;
      if (cf.assetRecordId) {
        key = 'AR:' + cf.assetRecordId + '|' + dk + '|' + cf.type + '|' + String(cf.amount);
      } else {
        key = 'I:' + dk + '|' + cf.type + '|' + String(cf.amount) + '|' + (cf.note || '');
      }
      return [key, cf];
    })
  );
  for (const cf of backupData.cashFlows) {
    const dk = new Date(cf.date).toISOString().split('T')[0];
    let key;
    if (cf.assetRecordId) {
      const mappedArId = idMap[cf.assetRecordId] || cf.assetRecordId;
      key = 'AR:' + mappedArId + '|' + dk + '|' + cf.type + '|' + String(cf.amount);
    } else {
      key = 'I:' + dk + '|' + cf.type + '|' + String(cf.amount) + '|' + (cf.note || '');
    }
    const existing = currentCfByKey.get(key);
    if (existing && strategy === 'merge') {
      idMap[cf.id] = existing.id;
    } else {
      idMap[cf.id] = newId();
    }
  }

  return idMap;
}

router.post('/import', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { strategy, allowTampered, backup } = importSchema.parse(req.body);

    const jsonSize = Buffer.byteLength(JSON.stringify(backup), 'utf8');
    if (jsonSize > MAX_BACKUP_SIZE) {
      return res.status(413).json({ error: '备份文件过大' });
    }

    const headerResult = backupHeaderSchema.safeParse(backup);
    if (!headerResult.success) {
      return res.status(400).json({ error: '备份文件格式无效' });
    }

    const versionCheck = isVersionCompatible(backup.version);
    if (!versionCheck.compatible) {
      return res.status(400).json({ error: versionCheck.reason || '版本不兼容' });
    }

    const expectedChecksum = computeChecksum({
      version: backup.version,
      userId: backup.exportedBy.userId,
      exportedAt: backup.exportedAt,
      data: backup.data,
    });

    let checksumValid = false;
    try {
      checksumValid = crypto.timingSafeEqual(
        Buffer.from(backup.checksum, 'hex'),
        Buffer.from(expectedChecksum, 'hex')
      );
    } catch {
      checksumValid = false;
    }

    if (!checksumValid && !allowTampered) {
      return res.status(400).json({
        error: '备份文件校验和不匹配，可能被篡改',
        tampered: true,
      });
    }

    const current = await getCurrentCounts(userId);
    const idMap = regenerateIdsAndRemap(backup.data, current, strategy);

    await prisma.$transaction(async (tx) => {
      if (strategy === 'overwrite') {
        await tx.cashFlow.deleteMany({ where: { userId } });
        await tx.assetRecordTag.deleteMany({ where: { assetRecord: { userId } } });
        await tx.assetItem.deleteMany({ where: { assetRecord: { userId } } });
        await tx.assetRecord.deleteMany({ where: { userId } });
        await tx.liabilityRecord.deleteMany({ where: { userId } });
        await tx.goal.deleteMany({ where: { userId } });
        await tx.targetAllocation.deleteMany({ where: { userId } });
        await tx.category.deleteMany({ where: { userId } });
        await tx.tag.deleteMany({ where: { userId } });
      } else {
        const existingRecordsToDelete = new Set<string>();
        for (const r of backup.data.assetRecords) {
          const dateKey = new Date(r.date).toISOString().split('T')[0];
          for (const cr of current.assetRecords) {
            if (new Date(cr.date).toISOString().split('T')[0] === dateKey) {
              existingRecordsToDelete.add(cr.id);
            }
          }
        }
        const existingLiabToDelete = new Set<string>();
        for (const r of backup.data.liabilityRecords) {
          const dk1 = new Date(r.date).toISOString().split('T')[0];
          const key = r.name + '|' + dk1;
          for (const cr of current.liabilityRecords) {
            const dk2 = new Date(cr.date).toISOString().split('T')[0];
            const crKey = cr.name + '|' + dk2;
            if (crKey === key) {
              existingLiabToDelete.add(cr.id);
            }
          }
        }
        const existingGoalsToDelete = new Set<string>();
        for (const g of backup.data.goals) {
          for (const cg of current.goals) {
            if (cg.name === g.name) {
              existingGoalsToDelete.add(cg.id);
            }
          }
        }

        if (existingRecordsToDelete.size > 0) {
          const idsToDelete = Array.from(existingRecordsToDelete);
          await tx.assetRecordTag.deleteMany({ where: { assetRecordId: { in: idsToDelete } } });
          await tx.assetItem.deleteMany({ where: { assetRecordId: { in: idsToDelete } } });
          await tx.assetRecord.deleteMany({ where: { id: { in: idsToDelete } } });
        }
        if (existingLiabToDelete.size > 0) {
          await tx.liabilityRecord.deleteMany({
            where: { id: { in: Array.from(existingLiabToDelete) } },
          });
        }
        if (existingGoalsToDelete.size > 0) {
          await tx.goal.deleteMany({
            where: { id: { in: Array.from(existingGoalsToDelete) } },
          });
        }
        const existingCfToDelete = new Set<string>();
        const processedRecordIdsForCf: Record<string, string> = {};
        for (const rec of backup.data.assetRecords) {
          const dateKey = new Date(rec.date).toISOString().split('T')[0];
          for (const cr of current.assetRecords) {
            if (new Date(cr.date).toISOString().split('T')[0] === dateKey) {
              processedRecordIdsForCf[rec.id] = cr.id;
              break;
            }
          }
        }
        for (const cf of backup.data.cashFlows) {
          const dk = new Date(cf.date).toISOString().split('T')[0];
          let bkKey;
          if (cf.assetRecordId) {
            const mappedArId = processedRecordIdsForCf[cf.assetRecordId] || cf.assetRecordId;
            bkKey = 'AR:' + mappedArId + '|' + dk + '|' + cf.type + '|' + String(cf.amount);
          } else {
            bkKey = 'I:' + dk + '|' + cf.type + '|' + String(cf.amount) + '|' + (cf.note || '');
          }
          for (const ccf of current.cashFlows) {
            const cdk = new Date(ccf.date).toISOString().split('T')[0];
            let cKey;
            if (ccf.assetRecordId) {
              cKey = 'AR:' + ccf.assetRecordId + '|' + cdk + '|' + ccf.type + '|' + String(ccf.amount);
            } else {
              cKey = 'I:' + cdk + '|' + ccf.type + '|' + String(ccf.amount) + '|' + (ccf.note || '');
            }
            if (cKey === bkKey) {
              existingCfToDelete.add(ccf.id);
              break;
            }
          }
        }
        if (existingCfToDelete.size > 0) {
          await tx.cashFlow.deleteMany({
            where: { id: { in: Array.from(existingCfToDelete) } },
          });
        }

        if (backup.data.targetAllocation) {
          await tx.targetAllocation.deleteMany({ where: { userId } });
        }
      }

      for (const cat of backup.data.categories) {
        const newId = idMap[cat.id];
        const catData = {
          id: newId,
          userId,
          name: cat.name,
          color: cat.color,
          sortOrder: cat.sortOrder ?? 0,
          isActive: cat.isActive ?? true,
          isDefault: cat.isDefault ?? false,
          deletedAt: cat.deletedAt ? new Date(cat.deletedAt) : null,
        };
        await tx.category.upsert({
          where: { id: newId },
          create: catData,
          update: catData,
        });
      }

      for (const tag of backup.data.tags) {
        const newId = idMap[tag.id];
        const tagData = {
          id: newId,
          userId,
          name: tag.name,
          color: tag.color,
        };
        await tx.tag.upsert({
          where: { id: newId },
          create: tagData,
          update: tagData,
        });
      }

      const processedRecords: Record<string, string> = {};
      for (const record of backup.data.assetRecords) {
        const newId = idMap[record.id];
        await tx.assetRecord.upsert({
          where: { id: newId },
          create: {
            id: newId,
            userId,
            date: new Date(record.date),
            cash: Number(record.cash),
            longTermInvest: Number(record.longTermInvest),
            stableBond: Number(record.stableBond),
            total: Number(record.total),
            note: record.note ?? null,
            editCount: record.editCount ?? 0,
            previousSnapshot: record.previousSnapshot ?? null,
          },
          update: {
            date: new Date(record.date),
            cash: Number(record.cash),
            longTermInvest: Number(record.longTermInvest),
            stableBond: Number(record.stableBond),
            total: Number(record.total),
            note: record.note ?? null,
            editCount: record.editCount ?? 0,
            previousSnapshot: record.previousSnapshot ?? null,
          },
        });
        processedRecords[record.id] = newId;
      }

      for (const item of backup.data.assetItems) {
        const newAssetRecordId = processedRecords[item.assetRecordId] || idMap[item.assetRecordId];
        const newCategoryId = idMap[item.categoryId];
        if (!newAssetRecordId || !newCategoryId) continue;
        await tx.assetItem.create({
          data: {
            id: idMap[item.id],
            assetRecordId: newAssetRecordId,
            categoryId: newCategoryId,
            amount: Number(item.amount),
          },
        });
      }

      for (const link of backup.data.assetRecordTags) {
        const newAssetRecordId = processedRecords[link.assetRecordId] || idMap[link.assetRecordId];
        const newTagId = idMap[link.tagId];
        if (!newAssetRecordId || !newTagId) continue;
        await tx.assetRecordTag.create({
          data: {
            id: idMap[link.id],
            assetRecordId: newAssetRecordId,
            tagId: newTagId,
          },
        });
      }

      for (const record of backup.data.liabilityRecords) {
        const newId = idMap[record.id];
        await tx.liabilityRecord.upsert({
          where: { id: newId },
          create: {
            id: newId,
            userId,
            name: record.name,
            amount: Number(record.amount),
            date: new Date(record.date),
            note: record.note ?? null,
          },
          update: {
            name: record.name,
            amount: Number(record.amount),
            date: new Date(record.date),
            note: record.note ?? null,
          },
        });
      }

      for (const goal of backup.data.goals) {
        const newId = idMap[goal.id];
        const newCategoryId = goal.categoryId ? idMap[goal.categoryId] : null;
        await tx.goal.upsert({
          where: { id: newId },
          create: {
            id: newId,
            userId,
            name: goal.name,
            targetAmount: Number(goal.targetAmount),
            targetDate: new Date(goal.targetDate),
            scope: goal.scope ?? 'total',
            categoryId: newCategoryId,
            isCompleted: goal.isCompleted ?? false,
          },
          update: {
            name: goal.name,
            targetAmount: Number(goal.targetAmount),
            targetDate: new Date(goal.targetDate),
            scope: goal.scope ?? 'total',
            categoryId: newCategoryId,
            isCompleted: goal.isCompleted ?? false,
          },
        });
      }

      if (backup.data.targetAllocation) {
        const rawAlloc = backup.data.targetAllocation.allocations;
        let mappedAlloc: any = rawAlloc;
        if (Array.isArray(rawAlloc)) {
          mappedAlloc = rawAlloc.map((item: any) => {
            if (item && typeof item === 'object') {
              const newItem: any = { ...item };
              if (newItem.categoryId && idMap[newItem.categoryId]) {
                newItem.categoryId = idMap[newItem.categoryId];
              }
              for (const k of Object.keys(newItem)) {
                if (idMap[newItem[k]]) {
                  newItem[k] = idMap[newItem[k]];
                }
              }
              return newItem;
            }
            return item;
          });
        } else if (rawAlloc && typeof rawAlloc === 'object') {
          mappedAlloc = {};
          for (const key of Object.keys(rawAlloc)) {
            const newKey = idMap[key] || key;
            const val = rawAlloc[key];
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              const newVal: any = { ...val };
              if (newVal.categoryId && idMap[newVal.categoryId]) {
                newVal.categoryId = idMap[newVal.categoryId];
              }
              mappedAlloc[newKey] = newVal;
            } else {
              mappedAlloc[newKey] = val;
            }
          }
        }
        await tx.targetAllocation.upsert({
          where: { userId },
          create: {
            userId,
            allocations: mappedAlloc,
            warningThreshold: Number(backup.data.targetAllocation.warningThreshold ?? 10),
          },
          update: {
            allocations: mappedAlloc,
            warningThreshold: Number(backup.data.targetAllocation.warningThreshold ?? 10),
          },
        });
      }

      for (const cf of backup.data.cashFlows) {
        const newAssetRecordId = cf.assetRecordId
          ? (processedRecords[cf.assetRecordId] || idMap[cf.assetRecordId])
          : null;
        const newCfId = idMap[cf.id];
        const cfData = {
          userId,
          assetRecordId: newAssetRecordId,
          date: new Date(cf.date),
          amount: Number(cf.amount),
          type: cf.type,
          note: cf.note ?? null,
        };
        await tx.cashFlow.upsert({
          where: { id: newCfId },
          create: { id: newCfId, ...cfData },
          update: cfData,
        });
      }

      return { success: true };
    }, {
      maxWait: 30000,
      timeout: 120000,
    });

    res.json({
      success: true,
      message: strategy === 'overwrite' ? '覆盖恢复成功' : '合并恢复成功',
      strategy,
      integrity: checksumValid ? 'valid' : 'tampered_allowed',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Import backup error:', error);
    res.status(500).json({
      error: '恢复失败，已自动回滚。请检查备份文件是否正确，或尝试其他方式。',
      rollback: true,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/schema', authMiddleware, (_req, res) => {
  res.json({
    version: BACKUP_VERSION,
    maxSizeMB: MAX_BACKUP_SIZE / 1024 / 1024,
    supportedStrategies: ['merge', 'overwrite'],
    entities: [
      'categories',
      'tags',
      'assetRecords',
      'assetItems',
      'assetRecordTags',
      'liabilityRecords',
      'goals',
      'targetAllocation',
      'cashFlows',
    ],
  });
});

export default router;
